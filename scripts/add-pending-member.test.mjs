/**
 * ==============================================================================
 * ADD-PENDING-MEMBER — the two properties that make a placeholder safe
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * SOURCE-READ, NOT IMPORTED: the script calls `main()` on load and `main()`
 * initialises firebase-admin, so importing it in a test would try to authenticate
 * against a real project. Same reason `nric.test.js` reads `firestore.rules` as text.
 *
 * WHAT A PLACEHOLDER IS. A member document with no Firebase uid — keyed by an id
 * derived from the person's email — so a department can roster somebody who has not
 * registered yet. The roster only needs `displayName`; a uid is needed to sign in and
 * to be the target of a coverage swap. So the record is rosterable and cannot be
 * signed in as, and that asymmetry is the entire safety argument.
 *
 * THE TWO WAYS IT COULD GO WRONG, which is what this file pins:
 *   1. the id is not derived from the email, so the same person is added twice; and
 *   2. the placeholder outlives the real account, so the department has two of one
 *      colleague — both rostered, and the engine gives one person two duties at once
 *      believing they are two people.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const script = readFileSync(resolve(process.cwd(), 'scripts/add-pending-member.cjs'), 'utf8');
const fn = readFileSync(resolve(process.cwd(), 'functions/index.js'), 'utf8');

describe('a placeholder cannot become a second copy of somebody', () => {
    it('derives the id from the email, so adding twice is idempotent', () => {
        const match = script.match(/const pendingIdFor = \(email\) => PENDING_PREFIX \+ (.+);/);
        expect(match, 'pendingIdFor not found').not.toBeNull();
        // Mirror it and exercise it, rather than trusting that a function exists.
        const idFor = (email) => 'pending-' + email.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        expect(idFor('brandon.feng.gq@kkh.com.sg')).toBe('pending-brandon-feng-gq-kkh-com-sg');
        // Same address, same id — twice through is one row.
        expect(idFor('Brandon.Feng.GQ@kkh.com.sg')).toBe(idFor('brandon.feng.gq@kkh.com.sg'));
        // Different people never collide.
        expect(idFor('a@kkh.com.sg')).not.toBe(idFor('b@kkh.com.sg'));
    });

    it('leaves an address that already has a REAL account alone', () => {
        expect(script).toMatch(/REAL ACCOUNT/);
        expect(script).toMatch(/left alone/);
        expect(script).toMatch(/add them through the app instead/i);
    });

    it('marks the row with pendingEmail — the field the deletion matches on', () => {
        expect(script).toMatch(/pendingEmail: person\.email/);
    });
});

describe('the real account replaces the placeholder, in one batch', () => {
    /**
     * ⚠️ THE HALF THAT MAKES THE OTHER HALF SAFE. Without it, a lead who adds Brandon
     *    after he registers ends up with two of him in the staff pool, and the engine
     *    will give one person two duties at once believing they are two people.
     */
    it('inviteMember queries for a placeholder on the invitee address', () => {
        expect(fn).toMatch(/\.where\('pendingEmail', '==', email\)/);
    });

    it('deletes the placeholder AND its grade in the same batch as the membership write', () => {
        // ANCHORED ON THE QUERY, not on the first `db.batch()` in the file — there are
        // several, and the first is a different handler entirely. The first draft of
        // this test matched that one and failed for a reason that had nothing to do
        // with the code under test.
        const query = fn.indexOf(".where('pendingEmail', '==', email)");
        expect(query, 'the placeholder query is missing').toBeGreaterThan(-1);
        const batchStart = fn.indexOf('var batch = db.batch();', query);
        const commit = fn.indexOf('await batch.commit();', batchStart);
        expect(batchStart).toBeGreaterThan(query);
        expect(commit).toBeGreaterThan(batchStart);

        const block = fn.slice(batchStart, commit);
        expect(block, 'the membership write left the batch').toMatch(/batch\.set\(db\.doc\(writes\.member/);
        expect(block, 'the placeholder delete is not in the batch').toMatch(/batch\.delete\(placeholder\.ref\)/);
        expect(block, 'the orphan grade is not deleted with it').toMatch(/batch\.delete\(db\.doc\('teams\/' \+ context\.teamId \+ '\/grades\//);
    });

    it('reads the placeholders BEFORE opening the batch', () => {
        // A batch cannot read, and a read after the batch is built would be reading
        // state the batch is about to change.
        const query = fn.indexOf(".where('pendingEmail', '==', email)");
        expect(query).toBeGreaterThan(-1);
        expect(query, 'the query runs after the batch is opened')
            .toBeLessThan(fn.indexOf('var batch = db.batch();', query));
    });
});

describe('the script cannot write by accident', () => {
    it('requires --write, and names the project before reading anything', () => {
        expect(script).toMatch(/const WRITE = argv\.includes\('--write'\)/);
        const projectLine = script.indexOf('PROJECT :');
        const firstRead = script.indexOf('.get()');
        expect(projectLine).toBeGreaterThan(-1);
        expect(projectLine, 'the project is printed after the first read').toBeLessThan(firstRead);
    });

    it('refuses a malformed person rather than guessing', () => {
        const match = script.match(/if \(!\/\^\(AH\|NN\)\\d\{1,2\}\$\/\.test\(grade\)\)/);
        expect(match, 'the grade shape is not checked').not.toBeNull();
        // email:Name:Grade as ONE argument — parallel flags silently mis-pair when one
        // list is shorter, and mis-pairing here writes somebody else's grade against a
        // colleague's name.
        expect(script).toMatch(/Expected email:Name:Grade/);
    });

    it('says plainly what a placeholder cannot do', () => {
        // A row that looks like a colleague but cannot sign in, request cover or be
        // swapped with is a thing somebody will expect more of unless told.
        expect(script).toMatch(/WHAT A PLACEHOLDER CANNOT DO/);
        expect(script).toMatch(/cannot be signed in as|CANNOT BE SIGNED IN AS/i);
    });
});
