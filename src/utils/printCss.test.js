/**
 * ==============================================================================
 * PRINT STYLESHEET — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * ⚠️ WHY A TEST THAT READS CSS AS TEXT. jsdom does not evaluate `@media print`, and
 *    no unit test can tell you what came out of a printer. But the bug this file
 *    exists for was not subtle at render time — it was a rule that could not
 *    possibly work, and reading the rule catches it.
 *
 * ── THE BUG ──────────────────────────────────────────────────────────────────
 *
 * The stylesheet said `body > * { display: none }`, which hides `#root`. The
 * handover slip was a DESCENDANT of `#root`, and a descendant of a `display: none`
 * element is not rendered whatever its own `display` says — so
 * `.handover-slip { display: block !important }` could not revive it. Printing
 * produced a BLANK PAGE.
 *
 * The slip already had 19 tests. Every one of them checked what it SAYS — that it
 * is not a referral, that it carries the disclaimer — and not one checked whether
 * it could reach paper at all. A feature can be entirely correct and entirely
 * unreachable.
 *
 * ── ⚠️ WHY THIS FILE ALSO READS `HandoverSlip.jsx` ───────────────────────────
 *
 * The stylesheet is `display: none` on the slip's siblings AGAIN — the very shape
 * of the original bug. It is correct now for exactly one reason: the slip is
 * portalled to `document.body`, so it is no longer a descendant of anything the
 * rule hides. The CSS and the portal are a PAIR. Either one alone prints a blank
 * page, so the assertions below check both in the same file rather than trusting
 * two suites to be changed together.
 *
 * The intermediate `visibility: hidden` version is not the answer either, and the
 * measurements are in the stylesheet comment: hidden boxes still occupy layout,
 * so it printed the slip followed by seven blank pages.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const raw = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', 'index.css'), 'utf8');

/**
 * ⚠️ COMMENTS STRIPPED BEFORE ANY ASSERTION. The comment above the fixed rule
 *    QUOTES the broken one — `body > * { display: none }` — as the explanation, so
 *    a negative assertion run over the raw file matched the very text documenting
 *    why the rule is gone. A test that reads source must read the code, not the
 *    prose about the code.
 */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/** Just the `@media print` block, brace-matched. */
const printBlock = () => {
    const start = css.indexOf('@media print');
    expect(start, '@media print block not found in src/index.css').toBeGreaterThan(-1);
    let depth = 0;
    for (let i = css.indexOf('{', start); i < css.length; i += 1) {
        if (css[i] === '{') depth += 1;
        else if (css[i] === '}') { depth -= 1; if (depth === 0) return css.slice(start, i + 1); }
    }
    throw new Error('Unbalanced braces in the @media print block.');
};

/** `HandoverSlip.jsx` with its comments stripped, for the same reason. */
const slipSource = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'HandoverSlip.jsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('⚠️ the slip can actually reach paper', () => {
    /**
     * THE REGRESSION TEST, IN TWO HALVES. The rule below hides the slip's siblings
     * with `display: none` — unrecoverable for any descendant of what it hides.
     * That is only safe while the slip is NOT a descendant, which is what the
     * portal buys. Asserting one without the other is how the blank page comes
     * back.
     */
    it('hides the siblings with display, and exempts the slip from that rule', () => {
        const block = printBlock();
        expect(block, 'the page must be hidden with display:none, so it occupies no paper')
            .toMatch(/body\s*>\s*\*:not\(\.handover-slip\)\s*\{[^}]*display:\s*none/);
    });

    it('the slip is portalled to document.body, out of every display:none ancestor', () => {
        expect(slipSource, 'HandoverSlip must import createPortal')
            .toMatch(/import\s*\{[^}]*createPortal[^}]*\}\s*from\s*'react-dom'/);
        expect(slipSource, 'the slip must be portalled to document.body')
            .toMatch(/createPortal\([^)]*document\.body\s*\)/);
    });

    it('no body-level display:none rule catches the slip itself', () => {
        const block = printBlock();
        const bodyRules = block.match(/body\s*>?\s*\*[^{]*\{[^}]*display:\s*none[^}]*\}/g) || [];
        expect(bodyRules.length, 'expected exactly one body-level display:none rule').toBe(1);
        expect(bodyRules[0], 'that rule must exempt .handover-slip')
            .toMatch(/:not\(\.handover-slip\)/);
    });

    it('gives the slip a display of its own inside the print block', () => {
        expect(printBlock()).toMatch(/\.handover-slip\s*\{[\s\S]*?display:\s*block/);
    });

    /**
     * Positioning is deliberately ABSENT now. As the only rendered child of
     * `<body>` the slip starts at the top of the sheet on its own, and every
     * attempt to position it while it lived inside the glass card was defeated by
     * that card's `transform` and `backdrop-filter`.
     */
    it('needs no positioning, because it has no positioned ancestor left', () => {
        expect(printBlock()).not.toMatch(/\.handover-slip\s*\{[^}]*position:\s*(absolute|fixed)/);
    });

    it('the slip is hidden on screen, outside the print block', () => {
        expect(css).toMatch(/\.handover-slip\s*\{\s*display:\s*none;\s*\}/);
    });
});

describe('⚠️ paper is not a screen', () => {
    /**
     * A handover slip goes to a centre's office printer. Glass, gradients and dark
     * mode render as grey mud there and empty a cartridge — which is why the screen
     * and the paper are deliberately two different designs, and why a redesign
     * must not "unify" them.
     */
    it('forces a white background and black text', () => {
        const block = printBlock();
        expect(block).toMatch(/background:\s*#fff/);
        expect(block).toMatch(/color:\s*#000/);
    });

    it('uses no blur, no gradient and no glass on paper', () => {
        const block = printBlock();
        expect(block).not.toMatch(/backdrop-filter/);
        expect(block).not.toMatch(/\bfilter:\s*blur/);
        expect(block).not.toMatch(/linear-gradient/);
    });

    it('sets a page margin, so nothing is clipped by the printer', () => {
        expect(printBlock()).toMatch(/@page\s*\{[^}]*margin/);
    });

    /**
     * On paper a URL is only useful if it can be typed, so it must wrap rather
     * than overflow the sheet.
     */
    it('lets long URLs wrap', () => {
        expect(printBlock()).toMatch(/\.slip-url[^}]*word-break:\s*break-all/);
    });
});

describe('the glass system does not leak onto paper', () => {
    it('the screen styles use backdrop blur, and the print block does not', () => {
        const glass = readFileSync(
            resolve(dirname(fileURLToPath(import.meta.url)), 'glass.js'), 'utf8');
        expect(glass).toMatch(/backdrop-blur/);
        expect(printBlock()).not.toMatch(/backdrop-blur/);
    });
});
