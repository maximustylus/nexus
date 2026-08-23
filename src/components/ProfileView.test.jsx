/**
 * ==============================================================================
 * EDIT PROFILE — the screen that saves to two documents
 * ==============================================================================
 *
 * Display name, department, bio, password and preferences go to `users/{uid}`.
 * Grade and profession go to `teams/{teamId}/members/{uid}`, and the reason is a
 * rule rather than a preference: `users` is `allow get: if isSelf(userId)`, so a
 * grade stored there is one the roster engine can never read.
 *
 * ⚠️ TWO DOCUMENTS UNDER TWO RULES CANNOT BE WRITTEN ATOMICALLY FROM A CLIENT.
 *    So the interesting cases here are the partial ones: the profile saved and the
 *    membership did not. What must never happen is a screen that reports success
 *    for a write that was refused, or reports total failure for one that half
 *    landed and makes somebody retype a bio that is already stored.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

vi.mock('../firebase', () => ({ db: {}, auth: { currentUser: null }, storage: {} }));

const updateDoc = vi.fn(() => Promise.resolve());
const setDoc = vi.fn(() => Promise.resolve());
let profileSnapshot = {};
let storedGrade = 'AH13';

/**
 * ⚠️ THE LISTENER MOCK HAS TO ROUTE BY PATH NOW, and that is not scaffolding
 *    detail — it is the shape of the change. The screen reads TWO documents:
 *    `users/{uid}` for the profile, and `teams/{id}/grades/{uid}` for the grade,
 *    which is a separate document precisely so a colleague cannot open it. A mock
 *    that answered both with the same object would let a test pass while the two
 *    were merged back together.
 */
vi.mock('firebase/firestore', () => ({
    doc: vi.fn((_db, ...segments) => ({ path: segments.join('/') })),
    updateDoc: (...args) => updateDoc(...args),
    setDoc: (...args) => setDoc(...args),
    onSnapshot: vi.fn((ref, onNext) => {
        if (String(ref.path).includes('/grades/')) {
            onNext({ exists: () => storedGrade !== null, data: () => ({ grade: storedGrade }) });
        } else {
            onNext({ exists: () => true, data: () => profileSnapshot });
        }
        return () => {};
    }),
}));

vi.mock('firebase/storage', () => ({
    ref: vi.fn(() => ({})),
    uploadBytesResumable: vi.fn(() => Promise.resolve({ ref: {} })),
    getDownloadURL: vi.fn(() => Promise.resolve('https://example.invalid/a.png')),
}));

vi.mock('firebase/auth', () => ({ updatePassword: vi.fn(() => Promise.resolve()) }));

let teamContext;
vi.mock('../context/TeamContext', () => ({ useTeam: () => teamContext }));

import ProfileView from './ProfileView';

const USER = { uid: 'uid-alif-000000000000000000', name: 'Muhammad Alif Bin Abu Bakar', email: 'a@kkh.com.sg' };
const TEAM_ID = 'kkh-sport-exercise-medicine';

const withTeam = (over = {}) => ({
    teamId: TEAM_ID,
    team: { name: 'Sport & Exercise Medicine', institution: 'KKH' },
    // ⚠️ NO `grade` HERE. It is not a membership field any more — it is
    //    `teams/{id}/grades/{uid}`, its own document under its own rule, because a
    //    rule cannot grant `get` on a document while withholding one of its fields.
    membership: { role: 'lead', profession: 'physiotherapist' },
    ...over,
});

const startEditing = () => fireEvent.click(screen.getByRole('button', { name: /edit profile/i }));
const save = async () => {
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /save changes/i })); });
};

const allWrites = () => [...updateDoc.mock.calls, ...setDoc.mock.calls];
const pathsWritten = () => allWrites().map(([ref]) => ref.path);
const payloadFor = (fragment) => {
    const call = allWrites().find(([ref]) => ref.path.includes(fragment));
    return call ? call[1] : null;
};

beforeEach(() => {
    updateDoc.mockReset().mockResolvedValue(undefined);
    setDoc.mockReset().mockResolvedValue(undefined);
    profileSnapshot = { name: USER.name, department: 'SSMC', bio: 'hello', role: 'Lead CEP' };
    storedGrade = 'AH13';
    teamContext = withTeam();
});

afterEach(() => cleanup());

// ── 1. THE SPLIT ─────────────────────────────────────────────────────────────

describe('where each field is saved', () => {
    it('sends name, department and bio to the user document', async () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/bio \/ status/i), { target: { value: 'on leave' } });
        await save();

        const profile = payloadFor('users');
        expect(profile.bio).toBe('on leave');
        expect(profile.name).toBe(USER.name);
        // Grade must NOT be here: nobody else could ever read it.
        expect(profile.grade).toBeUndefined();
        expect(profile.profession).toBeUndefined();
    });

    /**
     * ⚠️ THE PRIVACY ASSERTION. Grade must land in `grades/`, never in `members/`
     *    — the membership is readable by the whole team, the grade document is not.
     */
    it('sends the grade to its own private document, not to the membership', async () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/job grade/i), { target: { value: 'AH16' } });
        await save();

        expect(pathsWritten()).toContain(`teams/${TEAM_ID}/grades/${USER.uid}`);
        expect(payloadFor('/grades/')).toEqual({ grade: 'AH16' });
        expect(pathsWritten().some((path) => path.includes('/members/'))).toBe(false);
    });

    it('sends the profession to the membership, where the team can read it', async () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/profession/i), { target: { value: 'occupational-therapist' } });
        await save();

        expect(payloadFor('/members/')).toEqual({ profession: 'occupational-therapist' });
    });

    /**
     * ⚠️ ONE EXTRA KEY FAILS THE WHOLE WRITE. The member rule is
     *    `changedKeys().hasOnly([...])`, so a payload carrying `name` would be
     *    refused entirely and the person told their save failed, naming nothing
     *    they did.
     */
    it('never puts a profile field, or a grade, in the membership payload', async () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Alif' } });
        fireEvent.change(screen.getByLabelText(/profession/i), { target: { value: 'occupational-therapist' } });
        fireEvent.change(screen.getByLabelText(/job grade/i), { target: { value: 'AH14' } });
        await save();

        // `grade` is no longer in the member rule's allowlist, so including it would
        // fail the WHOLE write — this is a save-breaking bug as well as a leak.
        expect(Object.keys(payloadFor('/members/'))).toEqual(['profession']);
    });

    it('skips the membership write entirely when neither field moved', async () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/bio \/ status/i), { target: { value: 'back' } });
        await save();

        expect(pathsWritten().filter((path) => path.includes('/members/') || path.includes('/grades/'))).toEqual([]);
    });
});

// ── 2. NO TEAM ───────────────────────────────────────────────────────────────

describe('somebody with no team yet', () => {
    beforeEach(() => {
        teamContext = { teamId: null, team: null, membership: null };
        storedGrade = null;
    });

    /**
     * The holding-screen visitor. They still have a name, a bio and a password to
     * change — and offering them two controls whose save is guaranteed to be
     * skipped would be a form that lies.
     */
    it('is not offered grade or profession', () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        expect(screen.queryByLabelText(/job grade/i)).toBeNull();
        expect(screen.queryByLabelText(/profession/i)).toBeNull();
    });

    it('can still save the rest of their profile', async () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/bio \/ status/i), { target: { value: 'waiting' } });
        await save();

        expect(payloadFor('users').bio).toBe('waiting');
        expect(pathsWritten().some((path) => path.includes('/members/') || path.includes('/grades/'))).toBe(false);
    });
});

// ── 3. THE PARTIAL FAILURE ───────────────────────────────────────────────────

describe('when the membership write is refused', () => {
    /**
     * ⚠️ THE CASE THIS SUITE EXISTS FOR. The profile write succeeded and the
     *    membership write did not. Reporting a blanket failure would make somebody
     *    retype a bio that is already stored; reporting success would leave them
     *    believing a grade landed that did not.
     */
    it('says which half saved and which did not', async () => {
        updateDoc.mockResolvedValueOnce(undefined);                    // users
        setDoc.mockRejectedValueOnce(new Error('permission-denied'));  // grades

        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/job grade/i), { target: { value: 'AH17' } });
        await save();

        const message = document.body.textContent;
        expect(message).toMatch(/bio were saved/i);
        expect(message).toMatch(/grade and profession\s+were not|were not/i);
        expect(message).not.toMatch(/updated successfully/i);
    });
});

// ── 4. WHAT THE PERSON IS TOLD BEFORE THEY COMMIT ────────────────────────────

describe('the consequence of a grade, beside the control that sets it', () => {
    /**
     * Grade is self-set by the owner's decision and nothing reviews it, so the
     * only honest mitigation is that somebody selecting a principal grade reads
     * what it does at the moment they select it — not from a roster three weeks on.
     */
    it('warns that a senior grade attracts lead shifts, before saving', () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/job grade/i), { target: { value: 'AH17' } });
        expect(screen.getByText(/most senior/i)).toBeTruthy();
        expect(screen.getByText(/only you and your team lead can see this/i)).toBeTruthy();
    });

    it('says the opposite for a junior grade rather than staying silent', () => {
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/job grade/i), { target: { value: 'AH8' } });
        expect(screen.getByText(/will not give you lead shifts/i)).toBeTruthy();
    });

    it('describes the DRAFT choice, not the saved one', () => {
        // Stored AH13 (senior); selecting AH8 must immediately say "not lead",
        // or the sentence is describing a grade the person is moving away from.
        render(<ProfileView user={USER} onLogout={() => {}} />);
        startEditing();
        fireEvent.change(screen.getByLabelText(/job grade/i), { target: { value: 'AH8' } });
        expect(screen.queryByText(/can give you lead shifts\./i)).toBeNull();
    });
});
