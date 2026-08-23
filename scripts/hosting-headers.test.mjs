/**
 * ==============================================================================
 * HOSTING CACHE HEADERS — why a shipped change was not on screen
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * v2.1.0 deployed green — tests, lint, build, rules, Hosting, all eleven steps —
 * and the owner opened NEXUS to find none of it there. The bundle carried every
 * change (`grep` on `dist/assets/*.js` found each new string) and Hosting had
 * served it. The browser was showing the previous `index.html`.
 *
 * ⚠️ `firebase.json` DECLARED NO HEADERS AT ALL, so Firebase Hosting's default
 *    applied to `index.html` — and `index.html` is the ONE file that must never be
 *    cached. Vite fingerprints every asset (`index-a1b2c3.js`), so the assets are
 *    safe to cache forever; `index.html` is the map that says WHICH fingerprint is
 *    current. A stale map points at the old bundle, and the deploy is invisible
 *    until the cache expires — for everyone, not just the person who deployed.
 *
 * The two rules are opposites and both are required:
 *
 *   index.html   no-store  — it is the pointer; a stale pointer hides everything
 *   /assets/**   immutable — the name contains the hash, so the content cannot
 *                            change under a given name and a year is safe
 *
 * The service worker joins `index.html`: a cached one keeps registering an old
 * script, which is how a push-notification fix ships and never arrives.
 *
 * This is a CONFIGURATION test rather than a behaviour test, and it earns its
 * place: nothing else in the suite can fail when this file is wrong. The symptom
 * is "the feature you just shipped is missing", which reads as a broken build.
 * ==============================================================================
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(resolve(HERE, '..', 'firebase.json'), 'utf8'));

const headersFor = (source) => {
    const rule = (config.hosting.headers || []).find((entry) => entry.source === source);
    return rule ? Object.fromEntries(rule.headers.map((h) => [h.key, h.value])) : null;
};

describe('firebase.json hosting headers', () => {
    it('declares headers at all — the absence is what caused this', () => {
        expect(config.hosting.headers, 'no headers block: Hosting defaults apply to index.html')
            .toBeTruthy();
    });

    /**
     * ⚠️ THE LOAD-BEARING ONE. `index.html` names the fingerprinted bundle. Cache it
     *    and every deploy is invisible until the cache expires.
     */
    it('never caches index.html', () => {
        const cacheControl = headersFor('/index.html')?.['Cache-Control'];
        expect(cacheControl, 'index.html has no Cache-Control rule').toBeTruthy();
        expect(cacheControl).toMatch(/no-store|no-cache/);
        expect(cacheControl, 'a max-age on index.html hides the next deploy')
            .not.toMatch(/max-age=[1-9]/);
    });

    /**
     * A cached service worker keeps registering an old script — which is how a
     * push-notification fix ships and never arrives.
     */
    it('never caches the service worker', () => {
        const cacheControl = headersFor('/firebase-messaging-sw.js')?.['Cache-Control'];
        expect(cacheControl).toMatch(/no-store|no-cache/);
    });

    /**
     * The opposite rule, and it is not a nicety: without it every asset inherits a
     * short default and a returning clinician re-downloads the whole bundle. Safe
     * precisely because Vite puts the content hash in the filename — the content
     * under a given name cannot change.
     */
    it('caches fingerprinted assets for a long time', () => {
        const cacheControl = headersFor('/assets/**')?.['Cache-Control'];
        expect(cacheControl).toMatch(/max-age=\d{7,}/);
        expect(cacheControl).toMatch(/immutable/);
    });

    it('still rewrites everything to index.html, which is what makes the SPA routes work', () => {
        expect(config.hosting.rewrites).toEqual([{ source: '**', destination: '/index.html' }]);
    });
});
