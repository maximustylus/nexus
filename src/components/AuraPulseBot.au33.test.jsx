/**
 * ==============================================================================
 * AURA PULSE BOT — `AU33`: THE SHORTENED-REWORK NOTE REACHES THE TRANSCRIPT
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/AuraPulseBot.au33.test.jsx
 *
 * `src/utils/reworkNote.test.js` proves the DECISION is right. It says nothing
 * about whether this component asks the question correctly, finds the previous
 * document, or renders the answer — and a module that is right behind a wiring
 * that is wrong is this repository's signature defect (`AC1`, `CP15`, and the
 * four checker defects the P8.8 transcripts exposed). So this file drives two
 * real turns through the mounted panel and reads the screen.
 *
 * The mocked callable returns a long SOP, then a short memo, exactly as the
 * live model did on cloud runs 2 and 3.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const ctx = vi.hoisted(() => ({ isDemo: false, teamId: 'team-1' }));
const callable = vi.hoisted(() => ({ fn: null }));

vi.mock('../firebase', () => ({
    db: { __mock: 'firestore-db' },
    auth: { __mock: 'auth' },
    storage: { __mock: 'storage' },
    messaging: { __mock: 'messaging' },
    requestForToken: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(() => ({ __mock: 'docRef' })),
    setDoc: vi.fn(() => Promise.resolve()),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    updateDoc: vi.fn(() => Promise.resolve()),
    deleteField: vi.fn(() => ({ __mock: 'deleteField' })),
    arrayUnion: vi.fn((value) => ({ __mock: 'arrayUnion', value })),
    collection: vi.fn(() => ({ __mock: 'collectionRef' })),
    query: vi.fn(() => ({ __mock: 'query' })),
    where: vi.fn(() => ({ __mock: 'where' })),
    onSnapshot: vi.fn(() => () => {}),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('firebase/functions', () => ({
    getFunctions: vi.fn(() => ({ __mock: 'functions' })),
    httpsCallable: vi.fn(() => (...args) => callable.fn(...args)),
}));

vi.mock('docx', () => ({
    Document: class {}, Packer: { toBlob: vi.fn() }, Paragraph: class {},
    TextRun: class {}, HeadingLevel: {}, AlignmentType: {},
}));

vi.mock('../context/NexusContext', async () => {
    const ReactModule = await import('react');
    return {
        useNexus: () => {
            const [auraHistory, setAuraHistory] = ReactModule.useState([]);
            return { isDemo: ctx.isDemo, auraHistory, setAuraHistory };
        },
        NexusProvider: ({ children }) => children,
    };
});

vi.mock('../context/TeamContext', () => ({ useTeam: () => ({ teamId: ctx.teamId }) }));

import AuraPulseBot from './AuraPulseBot';

const USER = { uid: 'uid-alif', id: 'alif', name: 'Alif', title: 'Clinical Exercise Physiologist' };

/** The two documents from cloud run 3: 1,435 chars, then 763. */
const SOP = [
    'STANDARD OPERATING PROCEDURE: PATIENT ROOMING WORKFLOW', '',
    '1. PURPOSE', 'To standardise the patient rooming process for outpatient clinics and ensure safety.', '',
    '2. SCOPE', 'Applies to all clinical and administrative staff responsible for rooming patients.', '',
    '3. PROCEDURE',
    '3.1. Preparation: review the daily clinic schedule and confirm room availability.',
    '3.2. Identification: verify patient identity using two standard identifiers.',
    '3.3. Escort: take the patient to the designated consultation room.',
    '3.4. Vitals: record resting heart rate and blood pressure, and document them.',
    '3.5. Handover: notify the attending physiologist that the patient is ready.', '',
    '4. REVIEW', 'This document must be reviewed against departmental guidelines before use.',
].join('\n').padEnd(1435, ' ');

const MEMO = [
    'TO: Clinical Exercise Physiology Department', 'FROM: Alif', 'SUBJECT: Patient Rooming Workflow', '',
    '1. Identification: verify identity using two identifiers.',
    '2. Vitals: record and enter into the record system.',
    '3. Handover: notify the attending physiologist.',
].join('\n').padEnd(763, ' ');

const replyWith = (reply, action) => Promise.resolve({
    data: {
        text: JSON.stringify({
            reply, mode: 'ASSISTANT', diagnosis_ready: false, phase: null, energy: null,
            action,
            db_workload: {
                target_collection: null, target_doc: null, target_field: null,
                target_value: null, target_month: null,
            },
        }),
        provenanceFooter: '',
    },
});

/**
 * ⚠️ WAIT FOR THE REPLY, NOT FOR YOUR OWN MESSAGE. The user's line renders
 *    synchronously on submit, so waiting for it returns while the panel is
 *    still busy — and the second turn was then dropped, which read as the note
 *    failing to appear. The test was wrong, not the wiring.
 */
/**
 * `SEND_COOLDOWN_MS` is 2,000 and the handler returns SILENTLY inside it — no
 * error, no message, nothing on screen. Two turns fired back to back in a test
 * therefore produce one, and the second turn's absence reads as the feature
 * being broken. Advance the clock between turns.
 */
const COOLDOWN_MS = 2000;
let clock = Date.now();
const passTheCooldown = () => {
    clock += COOLDOWN_MS + 50;
    vi.setSystemTime(clock);
};

const say = async (text, expectReply) => {
    const input = screen.getByPlaceholderText(/ask aura/i);
    fireEvent.change(input, { target: { value: text } });
    // ⚠️ THERE IS NO FORM. `fireEvent.submit` on the textarea does nothing at
    //    all, and the message that appears on screen is the textarea's own
    //    value — which is exactly how a first attempt at this file "rendered
    //    the user's line" while never sending anything. The send button is the
    //    only trigger besides Enter on desktop.
    const send = [...document.querySelectorAll('button')]
        .find((b) => b.querySelector('svg.lucide-send') || b.querySelector('.lucide-send'));
    expect(send, 'send button not found').toBeTruthy();
    passTheCooldown();
    fireEvent.click(send);
    await waitFor(() => expect(screen.getByText(expectReply)).toBeTruthy(), { timeout: 4000 });
};

/** Scripted replies in order; the last one repeats if asked for again. */
const script = (...responses) => {
    let i = 0;
    return vi.fn(() => responses[Math.min(i++, responses.length - 1)]());
};

const openSession = () => {
    const persona = screen.getByRole('listbox').querySelector('button');
    fireEvent.click(persona);
};

let scrollIntoView;

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = false;
    localStorage.clear();
    clock = Date.now();
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['Date'] });
    vi.setSystemTime(clock);
    scrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
    vi.useRealTimers();
    cleanup();
    Element.prototype.scrollIntoView = scrollIntoView;
});

describe('AU33 — the note reaches the clinician, not just the module', () => {
    it('a "change only" rework that comes back 53% the length is reported on screen', async () => {
        callable.fn = script(
            () => replyWith('Here is the SOP.', SOP),
            () => replyWith(
                'I have updated the document. The body structure, wording, and terminology remain exactly the same.',
                MEMO,
            ),
        );

        render(<AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={USER} />);
        openSession();

        await say('Draft a 1-page SOP for patient rooming workflow.', /Here is the SOP/i);
        await say('Now make it a memo to the department instead. Change only what that requires.',
            /remain exactly the same/i);

        // The note is on screen, with the real figure.
        await waitFor(() => {
            expect(screen.getByText(/Note from NEXUS: this version is 53% the length of the previous one/i)).toBeTruthy();
        });

        // ⚠️ AND THE MODEL'S OWN WORDS ARE STILL THERE, UNEDITED. The control
        //    appends; it must never replace or soften what AURA said.
        expect(screen.getByText(/remain exactly the same/i)).toBeTruthy();
    });

    it('the FIRST document in a conversation is never reported — there is nothing to compare', async () => {
        callable.fn = script(() => replyWith('Here is the SOP.', SOP));

        render(<AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={USER} />);
        openSession();
        await say('Draft a 1-page SOP for patient rooming workflow. Change only what that requires.',
            /Here is the SOP/i);

        expect(screen.queryByText(/Note from NEXUS/i)).toBeNull();
    });

    it('a rework that keeps its length is not reported', async () => {
        callable.fn = script(
            () => replyWith('Here is the SOP.', SOP),
            () => replyWith('Reformatted as a memo.', `MEMO\n${SOP}`),
        );

        render(<AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={USER} />);
        openSession();
        await say('Draft a 1-page SOP for patient rooming workflow.', /Here is the SOP/i);
        await say('Now make it a memo to the department instead. Change only what that requires.',
            /Reformatted as a memo/i);

        expect(screen.queryByText(/Note from NEXUS/i)).toBeNull();
    });

    it('a shorter document the user ASKED for is not reported', async () => {
        callable.fn = script(
            () => replyWith('Here is the SOP.', SOP),
            () => replyWith('Here is a shorter memo.', MEMO),
        );

        render(<AuraPulseBot isOpen onClose={() => {}} onOpen={() => {}} user={USER} />);
        openSession();
        await say('Draft a 1-page SOP for patient rooming workflow.', /Here is the SOP/i);
        await say('Make it a memo and shorten it. Change only what that requires.', /Here is a shorter memo/i);

        expect(screen.queryByText(/Note from NEXUS/i)).toBeNull();
    });
});
