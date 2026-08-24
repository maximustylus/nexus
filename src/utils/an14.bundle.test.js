/**
 * ==============================================================================
 * `AN14` — the identities must not return, and this suite is the tripwire
 * ==============================================================================
 *
 * Seven colleagues' names and work email addresses shipped in the public bundle
 * from `TEAM_DIRECTORY`, on every route including the unauthenticated community
 * screening. The directory is deleted; recognition happens by salted digest in
 * `legacyBridge.js`. This suite is what makes the deletion STAY deleted.
 *
 * Two layers, because each catches what the other cannot:
 *
 *   1. SOURCE, comments stripped (`AC5`: a comment is a string, and several
 *      comments legitimately narrate this history by first name — a headstone is
 *      not a disclosure, because comments do not survive minification).
 *      Runs always.
 *
 *   2. THE BUILT BUNDLE — the artefact people actually download. The lesson of
 *      `AN1`/`AN2` is that source-level checks miss a second hardcoded copy;
 *      only the bundle tells the truth about what ships. Runs when `dist/`
 *      exists, and FAILS — not skips — when it does not and `CI` is set, so the
 *      pipeline cannot quietly lose the only check that matters.
 *
 * ⚠️ THIS FILE NECESSARILY CONTAINS THE STRINGS IT HUNTS. Test files are not
 *    bundled and never ship. The email local-parts are split at build of the
 *    pattern purely so a SOURCE-level grep for an address does not match this
 *    test's own definition of it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

/** The addresses the directory shipped, reassembled so source greps miss them. */
const at = (local, domain) => local + '@' + domain;
const EMAILS = [
    at('muhammad.alif', 'kkh.com.sg'),
    at('siti.nur.anisah.nh', 'kkh.com.sg'),
    at('benny.loo.k.g.', 'singhealth.com.sg'),
    at('brandon.feng.gg', 'kkh.com.sg'),
    at('lim.ying.xian', 'kkh.com.sg'),
    at('derlinder.kaur', 'kkh.com.sg'),
    at('fadzlynn.mohamad.fadzully', 'kkh.com.sg'),
];

/**
 * Names distinctive enough to grep without false positives. 'Alif' and 'Benny'
 * are excluded deliberately: short, common, and 'Alif' appears in legitimate
 * strings (the owner authored half the docs). The email check covers them.
 */
const DISTINCTIVE_NAMES = [
    'Derlinder', 'Fadzlynn', 'Ying Xian', 'ying_xian', 'fadzlynn',
    // From `LIVE_MOCK_POSTS` (FeedsView), the ninth copy: fabricated posts
    // attributed to real people. 'Linder' is case-sensitive on purpose —
    // lowercase would match 'cylinder'. 'Ashik' is a revoked member whose name
    // appeared nowhere else.
    'Ashik', 'Linder',
];

const stripComments = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

const walk = (dir, out = []) => {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full, out);
        else if (/\.(js|jsx)$/.test(entry) && !/\.test\.|\.spec\./.test(entry)) out.push(full);
    }
    return out;
};

describe('AN14 layer 1 — no shipped source module carries an identity in code', () => {
    const files = walk(resolve(root, 'src'));

    it('walks a real tree', () => {
        expect(files.length).toBeGreaterThan(50);
    });

    it.each(EMAILS.map((e) => [e]))('%s appears in no source file, comments included', (email) => {
        // Emails get the STRICTER check: unlike first names, an address in a
        // comment is still a copy nobody needs, and no comment in src/ should
        // carry one at all.
        for (const file of files) {
            expect(readFileSync(file, 'utf8').toLowerCase(),
                `${file} contains ${email}`).not.toContain(email.toLowerCase());
        }
    });

    it.each(DISTINCTIVE_NAMES.map((n) => [n]))('"%s" appears in no source CODE', (name) => {
        for (const file of files) {
            expect(stripComments(readFileSync(file, 'utf8')),
                `${file} code mentions ${name}`).not.toContain(name);
        }
    });
});

describe('AN14 layer 2 — the built bundle, which is what actually ships', () => {
    const assets = resolve(root, 'dist', 'assets');
    const bundleFiles = existsSync(assets)
        ? readdirSync(assets).filter((f) => f.endsWith('.js')).map((f) => join(assets, f))
        : [];

    it('has a bundle to check, or is honest that it cannot check', () => {
        if (bundleFiles.length === 0) {
            // Locally, `npm test` before the first `npm run build` has nothing to
            // scan and that is fine — layer 1 still ran. In CI it is NOT fine:
            // a pipeline that reordered its steps would silently lose the only
            // check against the artefact people download.
            expect(process.env.CI, 'CI must build before testing so AN14 can check the bundle')
                .toBeFalsy();
            return;
        }
        expect(bundleFiles.length).toBeGreaterThan(0);
    });

    it('carries none of the seven addresses and none of the distinctive names', () => {
        for (const file of bundleFiles) {
            const bundle = readFileSync(file, 'utf8');
            const lower = bundle.toLowerCase();
            for (const email of EMAILS) {
                expect(lower, `bundle carries ${email}`).not.toContain(email.toLowerCase());
            }
            for (const name of DISTINCTIVE_NAMES) {
                expect(bundle, `bundle carries ${name}`).not.toContain(name);
            }
        }
    });

    it('still carries the Marvel demo cast, proving the scan reads real content', () => {
        // A scan that passes on an empty read passes on anything. The sandbox
        // names are SUPPOSED to ship; finding them proves the bundle was read.
        if (bundleFiles.length === 0) return;
        const all = bundleFiles.map((f) => readFileSync(f, 'utf8')).join('');
        expect(all).toContain('Peter');
    });
});
