'use strict';

/**
 * ==============================================================================
 * A FAKE FIRESTORE — just large enough to drive `migrate-to-teams.cjs`
 * ==============================================================================
 *
 * ⚠️ THIS EXISTS SO THE CUTOVER'S THREE PROMISES CAN BE CHECKED RATHER THAN
 *    BELIEVED. `RELEASE-v2.0.0.md` and the migration's own error path tell an
 *    operator that it COPIES rather than moves, that it is IDEMPOTENT, and that it
 *    REFUSES to overwrite an existing destination. Those three sentences are the
 *    entire rollback story for a change that reshapes live clinical data, and
 *    until `migrate-to-teams.test.mjs` drove the real script against this, every
 *    one of them was a claim in a comment.
 *
 * It is deliberately small: `doc`, `collection`, `get`, `set`, `listDocuments`,
 * `listCollections`, and `FieldValue.arrayUnion`. That is exactly the surface the
 * migration uses, and a fake that grew past what its subject calls would start
 * being a second implementation of Firestore to maintain.
 */

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** The one sentinel the migration writes. */
const UNION = Symbol('arrayUnion');

const FieldValue = {
    arrayUnion: (...values) => ({ [UNION]: values }),
    serverTimestamp: () => '__serverTimestamp__',
};

/** Resolves `arrayUnion` against what is already stored, the way Firestore does. */
const applyFieldValues = (existing, data) => {
    const out = {};
    for (const [key, value] of Object.entries(data || {})) {
        if (value && typeof value === 'object' && value[UNION]) {
            const before = Array.isArray(existing && existing[key]) ? existing[key] : [];
            out[key] = [...new Set([...before, ...value[UNION]])];
        } else {
            out[key] = value;
        }
    }
    return out;
};

class FakeFirestore {
    constructor(seed = {}) {
        /** path → data. A document is a flat key in this map; there are no real subcollections. */
        this.docs = new Map(Object.entries(seed).map(([k, v]) => [k, clone(v)]));
        /** Every `set` that happened, so a dry run can be asserted to have made none. */
        this.writes = [];
        this.reads = [];
    }

    /** A snapshot of `path`, existing or not — Firestore delivers both. */
    _snapshot(path) {
        const data = this.docs.get(path);
        return {
            id: path.split('/').pop(),
            ref: this.doc(path),
            exists: data !== undefined,
            data: () => clone(data),
            get: (field) => (data ? data[field] : undefined),
        };
    }

    doc(path) {
        const store = this;
        return {
            path,
            id: path.split('/').pop(),
            async get() { store.reads.push(path); return store._snapshot(path); },
            async set(data, options) {
                const merge = !!(options && options.merge);
                const existing = store.docs.get(path);
                const next = merge
                    ? { ...(existing || {}), ...applyFieldValues(existing, data) }
                    : applyFieldValues(undefined, data);
                store.writes.push({ path, merge, data: clone(next) });
                store.docs.set(path, clone(next));
            },
        };
    }

    collection(path) {
        const store = this;
        const prefix = `${path}/`;
        // Direct children only — a document exactly one segment below.
        const children = () => [...store.docs.keys()]
            .filter((key) => key.startsWith(prefix) && key.slice(prefix.length).split('/').length === 1);
        return {
            async get() {
                store.reads.push(`${path}/*`);
                const docs = children().map((key) => store._snapshot(key));
                return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn) => docs.forEach(fn) };
            },
            async listDocuments() {
                store.reads.push(`${path}/*`);
                return children().map((key) => store.doc(key));
            },
        };
    }

    /** Root collections, which is all the migration asks for (the `archive_YYYY` sweep). */
    async listCollections() {
        this.reads.push('(root)');
        const names = new Set([...this.docs.keys()].map((key) => key.split('/')[0]));
        return [...names].map((id) => ({ id, path: id, ...this.collection(id) }));
    }
}

module.exports = { FakeFirestore, FieldValue };
