/**
 * THE APP HAS EXACTLY ONE VERSION, AND NO FILE MAY TYPE IT OUT BY HAND.
 *
 * `CHANGELOG.md` has asserted since v1.6.0 that "single source of truth for the
 * app version is `package.json` `version`". Nothing enforced it. By v1.12.0 the
 * deployed site was rendering FOUR different answers at once:
 *
 *     package.json          1.12.0
 *     App.jsx               v1.41-OFFICIAL      (sandbox banner)
 *     WelcomeScreen.jsx     System v1.52        (landing footer)
 *     AdminPanel.jsx        System Database v1.4 (admin header)
 *
 * All three literals were stale, none agreed, and all three were visible to the
 * other departments being shown the app. Nothing would ever have updated them,
 * because nothing referenced them.
 *
 * A convention that lives only in a document is a convention that drifts. This
 * test is the enforcement: it fails the build if a hand-typed version string
 * reappears in code that renders.
 *
 * COMMENTS ARE EXEMPT, DELIBERATELY. This codebase annotates changes with the
 * release that made them ("shipped v1.9.0", "audit M6.1", "RFC 5545 §3.3.11"),
 * which is valuable history and must stay writable. So the scan strips comments
 * first and only inspects code. That is also the honest limit of this test: it
 * cannot catch a version typed into a comment, and it is not trying to.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { APP_VERSION, APP_VERSION_LABEL } from './version.js';
import pkg from '../package.json';

// Resolved from the working directory, NOT from `import.meta.url`: under vitest's
// jsdom environment `import.meta.url` is not a file: URL, so `fileURLToPath`
// throws and `new URL('.', …).pathname` yields a bare `/src`. Both were tried;
// the second is the dangerous one, because scanning a directory that does not
// exist is indistinguishable from finding nothing wrong. Hence the file-count
// assertion below — a scan that reads no files must FAIL, not pass quietly.
const SRC = join(process.cwd(), 'src');

/**
 * Every .js/.jsx under src/, excluding only test files.
 *
 * `version.js` is deliberately NOT excluded. It was, and that left a hole: a
 * mutation replacing `export const APP_VERSION = version` with the hard-coded
 * `'1.12.0'` PASSED, because the equality check above compares it to
 * `pkg.version`, which was also 1.12.0 at the time. The literal and the truth
 * coincided, so nothing noticed. Scanning the module too closes it — a version
 * typed into it is a version-shaped literal like any other, while the real
 * `` `v${version}` `` template is not.
 */
const sourceFiles = (dir = SRC, out = []) => {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) { sourceFiles(full, out); continue; }
        if (!/\.jsx?$/.test(entry)) continue;
        if (/\.(test|spec)\.jsx?$/.test(entry)) continue;
        out.push(full);
    }
    return out;
};

/**
 * Remove `//` line comments and block comments, so only code remains.
 *
 * Strings are preserved — a version typed inside a rendered string literal is
 * exactly what this test exists to catch. It walks character by character rather
 * than using a regex, because a regex cannot tell `"http://x"` (a string
 * containing `//`) from a real comment, and getting that wrong would silently
 * blind the scan to everything after the first URL in a file.
 */
const stripComments = (code) => {
    let out = '';
    let i = 0;
    let mode = 'code';           // code | line | block | single | double | tick
    while (i < code.length) {
        const c = code[i];
        const next = code[i + 1];
        if (mode === 'code') {
            if (c === '/' && next === '/') { mode = 'line'; i += 2; continue; }
            if (c === '/' && next === '*') { mode = 'block'; i += 2; continue; }
            if (c === "'") mode = 'single';
            else if (c === '"') mode = 'double';
            else if (c === '`') mode = 'tick';
            out += c; i += 1; continue;
        }
        if (mode === 'line') {
            if (c === '\n') { mode = 'code'; out += '\n'; }
            i += 1; continue;
        }
        if (mode === 'block') {
            if (c === '*' && next === '/') { mode = 'code'; i += 2; continue; }
            if (c === '\n') out += '\n';   // keep line numbers honest
            i += 1; continue;
        }
        // inside a string: copy through, respect escapes, and end on the quote
        if (c === '\\') { out += c + (next ?? ''); i += 2; continue; }
        if ((mode === 'single' && c === "'") || (mode === 'double' && c === '"') || (mode === 'tick' && c === '`')) mode = 'code';
        out += c; i += 1; continue;
    }
    return out;
};

describe('the app version has exactly one source', () => {
    it('reads its version from package.json, not from a literal', () => {
        expect(APP_VERSION).toBe(pkg.version);
        expect(APP_VERSION_LABEL).toBe(`v${pkg.version}`);
        // A semver string, so a malformed package.json is caught here and not on screen.
        expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+(-[\w.]+)?$/);
    });

    it('has no hand-typed app version anywhere in rendering code', () => {
        // Version-shaped: `v1.4`, `v1.41-OFFICIAL`, `1.12.0`, `System v1.52`.
        const VERSION_SHAPED = /\bv\s?\d+\.\d+(\.\d+)?\b|\b\d+\.\d+\.\d+\b/g;

        // Two things are legitimately versioned and are NOT the app version.
        // Both are named here so that adding a third is a deliberate act.
        const ALLOWED = [
            /AURA[^\n]{0,40}v?2\.\d/i,        // the AURA engine's capability tier, tracked separately
            /RFC\s?\d+/i,                      // spec references, e.g. RFC 5545 §3.3.11
        ];

        const files = sourceFiles();
        // A scan that reads nothing passes vacuously, which is worse than no test
        // at all — it reports "no hand-typed versions" while having looked at
        // zero files. This is the tripwire for that.
        expect(files.length, `expected to scan the app's source under ${SRC}, found ${files.length} files`)
            .toBeGreaterThan(20);

        const offenders = [];
        for (const file of files) {
            const code = stripComments(readFileSync(file, 'utf8'));
            code.split('\n').forEach((line, index) => {
                const hits = line.match(VERSION_SHAPED);
                if (!hits) return;
                if (ALLOWED.some((re) => re.test(line))) return;
                offenders.push(`${relative(SRC, file)}:${index + 1}  ${hits.join(', ')}  ⟵  ${line.trim().slice(0, 90)}`);
            });
        }

        expect(
            offenders,
            'Hand-typed version string(s) found in rendering code. Import APP_VERSION_LABEL '
            + `from 'src/version.js' instead — package.json is the single source of truth:\n  `
            + offenders.join('\n  '),
        ).toEqual([]);
    });

    it('actually strips comments without being fooled by strings', () => {
        // The scan is only as trustworthy as this. If `//` inside a string ended a
        // "comment", everything after the first URL in a file would go unscanned.
        expect(stripComments('const a = 1; // v9.9.9 note')).not.toMatch(/9\.9\.9/);
        expect(stripComments('/* v9.9.9 */ const a = 1;')).not.toMatch(/9\.9\.9/);
        expect(stripComments('const u = "http://x/v9.9.9";')).toMatch(/9\.9\.9/);
        expect(stripComments("const u = 'a//b v9.9.9';")).toMatch(/9\.9\.9/);
        expect(stripComments('const t = `v9.9.9`;')).toMatch(/9\.9\.9/);
        // line numbers survive, so an offender's reported line is the real one
        expect(stripComments('a\n/* x\ny */\nb').split('\n').length).toBe(4);
    });
});
