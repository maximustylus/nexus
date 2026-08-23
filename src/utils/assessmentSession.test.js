/**
 * ==============================================================================
 * ASSESSMENT SESSION — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * Two defects with one cause: nothing about a person's assessment was written
 * anywhere the browser would keep it. Four screens each minted their own "ID:",
 * and thirteen questions plus a completed risk assessment were erased by a
 * refresh.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    getSessionId, saveProgress, loadProgress, clearProgress,
    saveResult, loadResult, clearAssessment,
} from './assessmentSession';

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('the session id', () => {
    /**
     * ⚠️ THE BUG. LanguageGate, PathwaySelection, AuraChat, ConventionalForm and
     *    ResultPage each ran their own `Math.random()`, and all five showed the
     *    result to the person as "ID:". The one written to Firestore was the
     *    third, so an id quoted off any other screen matched nothing in the record
     *    — on a portal that invites returning respondents to type a previous id in.
     */
    it('is the same every time it is asked for', () => {
        const first = getSessionId();
        expect(getSessionId()).toBe(first);
        expect(getSessionId()).toBe(first);
    });

    it('has the NX- shape the record is keyed by', () => {
        expect(getSessionId()).toMatch(/^NX-[A-Z0-9]{9}$/);
    });

    it('gives a different id to a different tab', () => {
        const first = getSessionId();
        sessionStorage.clear();                 // what a new tab starts from
        expect(getSessionId()).not.toBe(first);
    });

    /**
     * Safari private mode throws on sessionStorage rather than returning null, and
     * this is called during render. Degrading to a fresh id per call is the old
     * behaviour, which is bad; throwing would blank the page, which is worse.
     */
    it('returns an id rather than throwing when storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new DOMException('SecurityError');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('SecurityError');
        });
        expect(() => getSessionId()).not.toThrow();
        expect(getSessionId()).toMatch(/^NX-[A-Z0-9]{9}$/);
    });
});

describe('answers in progress', () => {
    it('round-trips what was saved', () => {
        saveProgress('form', { answers: { pavsDays: '3–4 days' }, step: 2 });
        expect(loadProgress('form')).toEqual({ answers: { pavsDays: '3–4 days' }, step: 2 });
    });

    /**
     * ⚠️ THE PATHWAYS MUST NOT RESUME INTO EACH OTHER. The form stores a flat
     *    answers object and a step index; the chat stores a message array and a
     *    collectedData map. Restoring one into the other would put a shape the
     *    component cannot render into its initial state.
     */
    it('does not hand the chat the form\'s saved state', () => {
        saveProgress('form', { answers: {}, step: 1 });
        expect(loadProgress('chat')).toBeNull();
    });

    it('returns null when nothing is saved', () => {
        expect(loadProgress('form')).toBeNull();
        expect(loadProgress('chat')).toBeNull();
    });

    it('clears', () => {
        saveProgress('chat', { currentStep: 4, messages: [], collectedData: {} });
        clearProgress();
        expect(loadProgress('chat')).toBeNull();
    });

    /**
     * A half-written or older-build value must not propagate a parse error into a
     * render. It is dropped, and the person starts fresh — which is what happened
     * before this module existed anyway.
     */
    it('discards corrupt stored JSON instead of throwing', () => {
        sessionStorage.setItem('nexus_assessment_progress', '{not json');
        expect(() => loadProgress('form')).not.toThrow();
        expect(loadProgress('form')).toBeNull();
    });

    it('does not throw when storage is unavailable', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('QuotaExceededError');
        });
        expect(() => saveProgress('form', { answers: {}, step: 0 })).not.toThrow();
    });
});

describe('the finished result', () => {
    const result = { score: 3, data: { pavsScore: 120 }, postalSector: '57', ctaTier: 'START' };

    /**
     * ⚠️ THE DEFECT THIS EXISTS FOR. The result reached ResultPage only as
     *    react-router navigation state, which does not survive a page load, and
     *    ResultPage redirects to the pathway picker when it is absent. A refresh
     *    after finishing threw the whole assessment away.
     */
    it('survives being saved and read back', () => {
        saveResult(result);
        expect(loadResult()).toEqual(result);
    });

    it('is null before anything is saved', () => {
        expect(loadResult()).toBeNull();
    });

    it('discards corrupt stored JSON', () => {
        sessionStorage.setItem('nexus_assessment_result', 'null}{');
        expect(loadResult()).toBeNull();
    });
});

describe('clearAssessment — the shared-device case', () => {
    /**
     * The portal is used on community-centre terminals and clinic tablets. Answers
     * about food insecurity and psychological distress left behind for the next
     * person are identifying in practice, whatever the privacy notice says about
     * names and NRIC. sessionStorage already dies with the tab; this is for the
     * case where it does not close.
     */
    it('removes the answers, the result AND the id together', () => {
        getSessionId();
        saveProgress('chat', { currentStep: 9, messages: [{ text: 'I feel isolated' }], collectedData: {} });
        saveResult({ score: 5 });

        clearAssessment();

        expect(loadProgress('chat')).toBeNull();
        expect(loadResult()).toBeNull();
        expect(sessionStorage.getItem('nexus_assessment_id')).toBeNull();
    });

    it('leaves no trace of an answer anywhere in storage', () => {
        saveProgress('chat', { currentStep: 1, messages: [{ text: 'chest pain when active' }], collectedData: {} });
        clearAssessment();
        const everything = Object.keys(sessionStorage).map((k) => sessionStorage.getItem(k)).join(' ');
        expect(everything).not.toContain('chest pain');
    });
});
