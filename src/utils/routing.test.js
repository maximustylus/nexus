/**
 * ==============================================================================
 * ROUTE TABLE — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * A `path="*"` route was added because `firebase.json` rewrites every URL to
 * `index.html`, so a mistyped path loaded the SPA and then rendered nothing —
 * a blank white page rather than a 404.
 *
 * ⚠️ THE RISK IN ADDING IT IS THAT IT SHADOWS A REAL ROUTE. React-router v6 ranks
 *    matches by specificity rather than by source order, so a wildcard placed
 *    before `/` should still lose to it — but "should" is not a property, and
 *    every screen in NEXUS is behind one of these paths. This asserts the ranking
 *    directly against react-router's own matcher, rather than against a reading of
 *    its documentation.
 */

import { describe, it, expect } from 'vitest';
import { matchRoutes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** The paths declared in `App.jsx`, read from the source so drift shows up here. */
const declaredPaths = () => {
    const src = readFileSync(
        resolve(dirname(fileURLToPath(import.meta.url)), '..', 'App.jsx'), 'utf8');
    const paths = [...src.matchAll(/<Route\s+path=(?:"([^"]+)"|\{([A-Z_]+)\})/g)]
        .map((m) => m[1] ?? m[2]);
    if (paths.length === 0) throw new Error('Parsed no <Route path=…> from App.jsx.');
    return paths;
};

// APPROVALS_PATH is a constant rather than a literal; its value does not affect
// wildcard ranking, so it is represented by a stand-in with the same shape.
const STANDIN = { APPROVALS_PATH: '/admin/teams', INSIGHTS_PATH: '/admin/community' };
const routes = () => declaredPaths().map((p) => ({ path: STANDIN[p] ?? p }));

const matched = (pathname) => {
    const found = matchRoutes(routes(), pathname);
    return found ? found[found.length - 1].route.path : null;
};

describe('the catch-all does not shadow a real route', () => {
    it.each([
        ['/', '/'],
        ['/individuals/language', '/individuals/language'],
        ['/individuals/pathway', '/individuals/pathway'],
        ['/individuals/form', '/individuals/form'],
        ['/individuals/chat', '/individuals/chat'],
        ['/individuals/result', '/individuals/result'],
        ['/admin/teams', '/admin/teams'],
        ['/admin/community', '/admin/community'],
    ])('%s still resolves to itself', (pathname, expected) => {
        expect(matched(pathname)).toBe(expected);
    });

    /**
     * The root is the one that matters most: it is the whole authenticated staff
     * app, and it sits AFTER the wildcard in the source.
     */
    it('the staff app at / is not swallowed by the wildcard declared above it', () => {
        expect(matched('/')).toBe('/');
        expect(declaredPaths().indexOf('*')).toBeLessThan(declaredPaths().indexOf('/'));
    });
});

describe('the catch-all catches what it should', () => {
    it.each([
        '/individuals/from',
        '/individuals',
        '/individuals/result/extra',
        '/nope',
        '/individuals/language/',
    ])('%s falls through to the not-found route', (pathname) => {
        const hit = matched(pathname);
        // A trailing slash on a declared path is still that path in v6.
        expect(hit === '*' || hit === pathname.replace(/\/$/, '')).toBe(true);
    });

    it('has exactly one wildcard, so there is one place to change it', () => {
        expect(declaredPaths().filter((p) => p === '*')).toHaveLength(1);
    });
});
