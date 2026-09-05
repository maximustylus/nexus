import { describe, it, expect } from 'vitest';
import {
    reworkNote, withReworkNote, noteFor, asksChangeOnly, asksShorter, SHRINK_THRESHOLD,
} from './reworkNote';

// The two cloud runs that closed the argument. Lengths are the real ones from
// the transcripts; the content is stand-in text because only length is measured.
const RUN2_SOP = 'x'.repeat(1181);
const RUN2_MEMO = 'y'.repeat(565);
const TURN_8 = 'Now make it a memo to the department instead. Change only what that requires.';

describe('reworkNote — the AU33 control', () => {
    it('fires on cloud run 2, turn 8: 565 chars from 1,181', () => {
        const note = reworkNote({ userText: TURN_8, previousDocument: RUN2_SOP, newDocument: RUN2_MEMO });
        expect(note).toContain('48%');
        expect(note).toMatch(/^Note from NEXUS:/);
        // It states a measurement. It does not accuse the model of lying.
        expect(note).not.toMatch(/false|untrue|lied|wrong|incorrect/i);
    });

    it('does NOT fire on cloud run 1, turn 8: the document was not shorter', () => {
        // size 1.10 — the model rephrased at the same length. Nothing to report,
        // even though the lines-carried check failed. This control is about
        // LENGTH, and it must not stand in for the other one.
        expect(reworkNote({ userText: TURN_8, previousDocument: RUN2_SOP, newDocument: 'z'.repeat(1300) })).toBeNull();
    });

    it('does NOT fire when the user asked for it shorter', () => {
        for (const ask of [
            'Make it a memo and shorten it. Change only what that requires.',
            'Change only the header, but give me a brief version.',
            'Just make it a memo, one-page please.',
            'Change only what that requires and summarise the steps.',
        ]) {
            expect(reworkNote({ userText: ask, previousDocument: RUN2_SOP, newDocument: RUN2_MEMO })).toBeNull();
        }
    });

    it('does NOT fire when the user did not ask for a targeted edit', () => {
        for (const ask of ['Rewrite this as a memo.', 'Make me a memo about rooming.', 'Do it differently.']) {
            expect(reworkNote({ userText: ask, previousDocument: RUN2_SOP, newDocument: RUN2_MEMO })).toBeNull();
        }
    });

    it('does NOT fire with no previous document — the first document in a chat', () => {
        expect(reworkNote({ userText: TURN_8, previousDocument: '', newDocument: RUN2_MEMO })).toBeNull();
        expect(reworkNote({ userText: TURN_8, previousDocument: '   ', newDocument: RUN2_MEMO })).toBeNull();
        expect(reworkNote({ userText: TURN_8, previousDocument: null, newDocument: RUN2_MEMO })).toBeNull();
    });

    it('does NOT fire with no new document — a clarifying question is not a rework', () => {
        expect(reworkNote({ userText: TURN_8, previousDocument: RUN2_SOP, newDocument: null })).toBeNull();
        expect(reworkNote({ userText: TURN_8, previousDocument: RUN2_SOP, newDocument: '' })).toBeNull();
    });

    it('the threshold is a boundary, not a cliff edge', () => {
        const prev = 'x'.repeat(1000);
        expect(reworkNote({ userText: TURN_8, previousDocument: prev, newDocument: 'y'.repeat(700) })).toBeNull();
        expect(reworkNote({ userText: TURN_8, previousDocument: prev, newDocument: 'y'.repeat(699) })).toContain('70%');
        expect(SHRINK_THRESHOLD).toBe(0.7);
    });

    it('a document that GREW is never reported', () => {
        expect(reworkNote({ userText: TURN_8, previousDocument: RUN2_MEMO, newDocument: RUN2_SOP })).toBeNull();
    });

    it.each([[undefined], [{}], [null]])('malformed input returns null rather than throwing: %s', (arg) => {
        expect(reworkNote(arg ?? undefined)).toBeNull();
    });
});

describe('asksChangeOnly / asksShorter', () => {
    it.each([
        'Change only what that requires.',
        'Only change the header.',
        'Make it a memo, keep everything else the same.',
        'Turn it into a memo without changing anything else.',
        'Just make it a memo.',
        'Same content, memo format.',
    ])('targeted: %s', (t) => expect(asksChangeOnly(t)).toBe(true));

    it.each(['Rewrite it.', 'Make a memo.', 'Draft an SOP.', ''])('not targeted: %s', (t) => expect(asksChangeOnly(t)).toBe(false));

    it.each([
        'shorten it', 'make it shorter', 'condense', 'summarise it',
        'a brief version', 'cut it down', 'bullet points',
    ])('shorter: %s', (t) => expect(asksShorter(t)).toBe(true));

    it.each(['make it a memo', 'change only the header'])('not shorter: %s', (t) => expect(asksShorter(t)).toBe(false));
});

describe('withReworkNote', () => {
    it('appends on its own paragraph', () => {
        expect(withReworkNote('I kept the steps the same.', noteFor(48)))
            .toBe('I kept the steps the same.\n\nNote from NEXUS: this version is 48% the length of the previous one. '
                + 'You asked for a targeted change, so check that nothing you needed was dropped.');
    });

    it('returns the reply untouched when there is no note', () => {
        expect(withReworkNote('Here is the memo.', null)).toBe('Here is the memo.');
    });

    it('never edits the model\'s own words', () => {
        const reply = 'I kept the procedural steps exactly the same.';
        expect(withReworkNote(reply, noteFor(48)).startsWith(reply)).toBe(true);
    });
});
