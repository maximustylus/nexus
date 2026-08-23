/**
 * ==============================================================================
 * MIGRATION — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * ⚠️ THIS IS THE ONLY IRREVERSIBLE STEP IN THE v2.0 CUTOVER, AND UNTIL THIS FILE
 *    EXISTED ITS SAFETY PROPERTIES WERE PROSE.
 *
 * `RELEASE-v2.0.0.md`, the plan, and the migration's own error path all tell an
 * operator three things, and those three sentences are the entire rollback story
 * for a change that reshapes live clinical data belonging to practising
 * clinicians:
 *
 *   1. it COPIES, never moves — the legacy documents are untouched, so rolling
 *      back is redeploying the previous bundle
 *   2. it is IDEMPOTENT — a half-finished run is recovered by re-running, not by
 *      hand-repair
 *   3. it REFUSES to overwrite an existing destination unless forced
 *
 * Each was a claim in a comment. This drives the REAL script — not a copy of its
 * logic — against `fakeFirestore.cjs` and a fake Auth, and checks all three.
 *
 * ── HOW IT DRIVES A SCRIPT THAT CALLS `initializeApp()` AT MODULE SCOPE ───────
 *
 * `migrate-to-teams.cjs` connects on load and ends with
 * `main().then(code => process.exit(code))`. Both are intercepted: the Admin SDK
 * subpath modules are replaced at require time, and `process.exit` resolves a
 * promise so each scenario waits for the whole run rather than racing it. Nothing
 * here can reach a real project — there is no network call to make.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'migrate-to-teams.cjs');

const { FakeFirestore, FieldValue } = require('./fakeFirestore.cjs');
const { MEMBERS, TEAM_ONE } = require('./team-one-manifest.cjs');
const Module = require('node:module');

const TEAM = TEAM_ONE.teamId;

/** The legacy shape as production holds it today, in miniature. */
const seedLegacy = () => {
    const seed = {
        'system_data/roster_2026': { '2026-08-15': [{ task: 'EFT', lead: 'Alif' }] },
        'system_data/daily_pulse': { Alif: { mood: 4 }, Anisah: { mood: 3 } },
        'system_data/monthly_attendance': { 2026: { Alif: 20 }, notes: 'not a year' },
        'system_data/reports_2026': { summary: 'y' },
        'wellbeing_history/_anonymous_logs': { logs: [{ mood: 2 }] },
        'shift_swaps/s1': { targetStaff: 'Ying Xian', requester: 'Alif', status: 'PENDING' },
        'feed_posts/p1': { author: 'Alif', body: 'hello' },
        'feed_posts/p1/comments/c1': { author: 'Anisah', body: 'hi' },
        'notifications/n1': { recipient: 'Alif', text: 'x' },
        'monthly_workload/2026-08': { Alif: 12 },
        'staff_loads/alif': { load: 3 },
        'cep_team/alif': { name: 'Alif' },
    };
    MEMBERS.forEach((member, i) => {
        seed[`users/uid-${i}`] = { displayName: member.displayName, email: member.email };
    });
    return seed;
};

/** The legacy collections the rebuild replaces — the ones that must come out untouched. */
const LEGACY_PREFIXES = ['system_data/', 'wellbeing_history/', 'shift_swaps/', 'feed_posts/',
    'notifications/', 'monthly_workload/', 'staff_loads/', 'cep_team/'];
const legacyOnly = (store) => Object.fromEntries([...store.docs.entries()]
    .filter(([key]) => LEGACY_PREFIXES.some((p) => key.startsWith(p))));

const fakeAuth = () => ({
    async getUserByEmail(email) {
        const i = MEMBERS.findIndex((m) => m.email.toLowerCase() === String(email).toLowerCase());
        if (i === -1) { const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; }
        return { uid: `uid-${i}`, email: MEMBERS[i].email, displayName: MEMBERS[i].displayName };
    },
    async listUsers() {
        return { users: MEMBERS.map((m, i) => ({ uid: `uid-${i}`, email: m.email, displayName: m.displayName })) };
    },
});

/** A syntactically valid key for the right project. Nothing authenticates with it. */
const FAKE_KEY = resolve(HERE, 'fake-service-account.test.json');

const run = async (store, argv) => {
    const realLoad = Module._load;
    const realArgv = process.argv;
    const realExit = process.exit;
    const realCred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const realLog = console.log;
    const realError = console.error;
    const lines = [];

    process.argv = ['node', SCRIPT, ...argv];
    process.env.GOOGLE_APPLICATION_CREDENTIALS = FAKE_KEY;
    console.log = (...args) => lines.push(args.join(' '));
    console.error = (...args) => lines.push(args.join(' '));

    Module._load = function patched(request, parent, isMain) {
        if (request === 'firebase-admin/app') return { initializeApp: () => ({}), cert: () => ({}), applicationDefault: () => ({}) };
        if (request === 'firebase-admin/firestore') return { getFirestore: () => store, FieldValue };
        if (request === 'firebase-admin/auth') return { getAuth: fakeAuth };
        return realLoad.call(this, request, parent, isMain);
    };

    let exitCode = null;
    let settle;
    const finished = new Promise((r) => { settle = r; });
    process.exit = (code) => { exitCode = code; settle(); };

    try {
        delete require.cache[require.resolve(SCRIPT)];
        require(SCRIPT);
        await Promise.race([finished, new Promise((r) => setTimeout(r, 15000))]);
    } finally {
        Module._load = realLoad;
        process.argv = realArgv;
        process.exit = realExit;
        console.log = realLog;
        console.error = realError;
        if (realCred === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        else process.env.GOOGLE_APPLICATION_CREDENTIALS = realCred;
    }
    return { output: lines.join('\n'), exitCode };
};

let store;
beforeEach(() => { store = new FakeFirestore(seedLegacy()); });

describe('⚠️ --dry-run is the default, and it writes nothing', () => {
    it('performs reads and no writes at all', async () => {
        const { exitCode } = await run(store, []);
        expect(store.reads.length, 'a dry run that reads nothing has planned nothing').toBeGreaterThan(0);
        expect(store.writes, 'the dry run wrote to Firestore').toEqual([]);
        expect(exitCode).toBe(0);
    });

    it('says so in as many words, so an operator is never guessing', async () => {
        const { output } = await run(store, []);
        expect(output).toMatch(/DRY RUN/i);
        expect(output).toMatch(/Nothing was written/i);
    });

    /** A missing key looks exactly like an empty project; it must abort, not proceed. */
    it('refuses to run at all with no credentials', async () => {
        const saved = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
        const bare = new FakeFirestore(seedLegacy());
        const realLoad = Module._load;
        Module._load = function patched(request, parent, isMain) {
            if (request === 'firebase-admin/app') return { initializeApp: () => ({}) };
            if (request === 'firebase-admin/firestore') return { getFirestore: () => bare, FieldValue };
            if (request === 'firebase-admin/auth') return { getAuth: fakeAuth };
            return realLoad.call(this, request, parent, isMain);
        };
        const realArgv = process.argv;
        const realExit = process.exit;
        const realLog = console.log;
        const realErr = console.error;
        console.log = () => {};
        console.error = () => {};
        process.argv = ['node', SCRIPT];
        let code = null;
        let settle;
        const done = new Promise((r) => { settle = r; });
        process.exit = (c) => { code = c; settle(); };
        try {
            delete require.cache[require.resolve(SCRIPT)];
            require(SCRIPT);
            await Promise.race([done, new Promise((r) => setTimeout(r, 15000))]);
        } finally {
            Module._load = realLoad; process.argv = realArgv; process.exit = realExit;
            console.log = realLog; console.error = realErr;
            if (saved !== undefined) process.env.GOOGLE_APPLICATION_CREDENTIALS = saved;
        }
        expect(code, 'no credentials must be a non-zero exit, not a quiet no-op').not.toBe(0);
        expect(bare.writes).toEqual([]);
    });
});

describe('⚠️ --write COPIES; the legacy documents are the rollback', () => {
    it('leaves every legacy document byte-identical', async () => {
        const before = JSON.stringify(legacyOnly(new FakeFirestore(seedLegacy())));
        await run(store, ['--write']);
        expect(JSON.stringify(legacyOnly(store)),
            'a legacy document changed — redeploying the old bundle would no longer restore the old app')
            .toBe(before);
    });

    it('writes the team, its members and the roster under teams/', async () => {
        await run(store, ['--write']);
        const paths = new Set(store.writes.map((w) => w.path));
        expect(paths).toContain(`teams/${TEAM}`);
        expect(paths).toContain(`teams/${TEAM}/rosters/2026`);
        MEMBERS.forEach((_, i) => expect(paths).toContain(`teams/${TEAM}/members/uid-${i}`));
    });

    it('copies the roster verbatim rather than transforming it', async () => {
        await run(store, ['--write']);
        expect(store.docs.get(`teams/${TEAM}/rosters/2026`))
            .toEqual(store.docs.get('system_data/roster_2026'));
    });

    /** Every collection the rebuild replaces has to arrive, or a section was skipped. */
    it('reaches every section, not just the ones before the first empty collection', async () => {
        await run(store, ['--write']);
        const paths = [...new Set(store.writes.map((w) => w.path))];
        for (const suffix of ['pulse/daily', 'wellbeing/_anonymous_logs', 'swaps/s1', 'feed/p1',
            'notifications/n1', 'workload/2026-08', 'attendance/2026', 'reports/2026']) {
            expect(paths, `nothing was written to ${suffix}`).toContain(`teams/${TEAM}/${suffix}`);
        }
    });
});

describe('⚠️ running it twice must land on the same state', () => {
    it('changes nothing on a second run', async () => {
        await run(store, ['--write']);
        const after = JSON.stringify([...store.docs.entries()].sort());
        store.writes.length = 0;
        const { exitCode } = await run(store, ['--write']);
        expect(JSON.stringify([...store.docs.entries()].sort()),
            'a half-finished run cannot be recovered by re-running if the state moves').toBe(after);
        expect(exitCode).toBe(0);
    });

    it('re-writes nothing under teams/ the second time', async () => {
        await run(store, ['--write']);
        store.writes.length = 0;
        await run(store, ['--write']);
        expect(store.writes.filter((w) => w.path.startsWith('teams/')).map((w) => w.path)).toEqual([]);
    });
});

describe('⚠️ it refuses to overwrite a destination that already exists', () => {
    it('leaves real work in place rather than replacing it', async () => {
        store.docs.set(`teams/${TEAM}/rosters/2026`, { '2026-09-01': [{ task: 'REAL WORK' }] });
        await run(store, ['--write']);
        expect(JSON.stringify(store.docs.get(`teams/${TEAM}/rosters/2026`)),
            'a roster somebody had already built was overwritten').toMatch(/REAL WORK/);
    });

    it('--force-overwrite is the only way through', async () => {
        store.docs.set(`teams/${TEAM}/rosters/2026`, { '2026-09-01': [{ task: 'REAL WORK' }] });
        await run(store, ['--write', '--force-overwrite']);
        // The source roster's days are now present, which the refusal above prevents.
        expect(store.docs.get(`teams/${TEAM}/rosters/2026`)['2026-08-15']).toBeDefined();
    });

    /**
     * ⚠️ THE REGRESSION TEST FOR `T1`. `--force-overwrite` used to MERGE, because
     *    both branches of `write()` called `set(data, { merge: true })` and merge is
     *    indistinguishable from replace on a destination that does not exist — which
     *    is every write in a normal run.
     *
     *    A roster document is a MAP KEYED BY DATE. Merging unions the two: days in
     *    both are replaced by the legacy copy, days present ONLY in the destination
     *    survive. What landed was a hybrid roster that never existed, half
     *    pre-migration and half whatever somebody had already built, and
     *    indistinguishable from a real one.
     *
     *    An operator reaching for this flag is choosing between two documents. They
     *    must get one of them.
     */
    it('REPLACES the destination rather than merging into it', async () => {
        store.docs.set(`teams/${TEAM}/rosters/2026`, {
            '2026-09-01': [{ task: 'REAL WORK' }],
            '2026-08-15': [{ task: 'ALSO REAL' }],
        });
        await run(store, ['--write', '--force-overwrite']);
        const after = store.docs.get(`teams/${TEAM}/rosters/2026`);
        expect(after, 'the destination must equal the legacy copy, not a union of the two')
            .toEqual(store.docs.get('system_data/roster_2026'));
        expect(after['2026-09-01'], 'a destination-only day survived a "force overwrite"').toBeUndefined();
    });

    it('says which documents it is replacing, rather than reporting them as ordinary writes', async () => {
        store.docs.set(`teams/${TEAM}/rosters/2026`, { '2026-09-01': [{ task: 'REAL WORK' }] });
        const { output } = await run(store, ['--write', '--force-overwrite']);
        expect(output).toMatch(/REPLACING the existing document/);
    });
});

describe('⚠️ a re-run must not undo what people have changed since — T2', () => {
    /**
     * `users/{uid}` is the one destination written on EVERY run, because
     * `teamIds: arrayUnion` has to be: somebody may already belong to another team
     * and a plain overwrite would drop that membership.
     *
     * It also used to carry `displayName` and `email` on every run, on the reasoning
     * that they are the migration's own facts about the person. They stop being that
     * the moment the person edits their own profile — and this file's error path
     * tells an operator "Re-running is safe", which is exactly what somebody does
     * after a partial failure.
     */
    it('leaves a display name the person has changed since migrating', async () => {
        await run(store, ['--write']);
        const uid = 'users/uid-1';
        store.docs.set(uid, { ...store.docs.get(uid), displayName: 'Renamed By The Person' });

        await run(store, ['--write']);
        expect(store.docs.get(uid).displayName,
            'a re-run reverted the name to the manifest value').toBe('Renamed By The Person');
    });

    it('still adds the team on every run, because arrayUnion is the point', async () => {
        store.docs.set('users/uid-1', { displayName: 'Existing Person', teamIds: ['some-other-team'] });
        await run(store, ['--write']);
        const teamIds = store.docs.get('users/uid-1').teamIds;
        expect(teamIds, 'the existing membership was dropped').toContain('some-other-team');
        expect(teamIds, 'the new team was not added').toContain(TEAM);
    });

    it('still fills in a name and email that are not there yet', async () => {
        await run(store, ['--write']);
        expect(store.docs.get('users/uid-0').displayName).toBe(MEMBERS[0].displayName);
        expect(store.docs.get('users/uid-0').email).toBe(MEMBERS[0].email.toLowerCase());
    });
});
