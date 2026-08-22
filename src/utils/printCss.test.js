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
 * handover slip is a DESCENDANT of `#root`, and a descendant of a `display: none`
 * element is not rendered whatever its own `display` says — so
 * `.handover-slip { display: block !important }` could not revive it. Printing
 * produced a BLANK PAGE.
 *
 * The slip already had 19 tests. Every one of them checked what it SAYS — that it
 * is not a referral, that it carries the disclaimer — and not one checked whether
 * it could reach paper at all. A feature can be entirely correct and entirely
 * unreachable.
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

describe('⚠️ the slip can actually reach paper', () => {
    /**
     * THE REGRESSION TEST. `display: none` on an ancestor is unrecoverable;
     * `visibility: hidden` is inherited but overridable on a descendant, which is
     * why it is the standard print-one-element pattern.
     */
    it('hides the page with visibility, never with display on an ancestor', () => {
        const block = printBlock();
        expect(block, 'body * must be hidden with visibility, not display')
            .toMatch(/body\s*\*\s*\{[^}]*visibility:\s*hidden/);
        expect(block, 'display:none on a body-level selector would hide the slip with it')
            .not.toMatch(/body\s*>?\s*\*\s*\{[^}]*display:\s*none/);
    });

    it('re-reveals the slip AND its descendants', () => {
        const block = printBlock();
        expect(block).toMatch(/\.handover-slip\s*,\s*\.handover-slip\s*\*\s*\{[^}]*visibility:\s*visible/);
    });

    it('gives the slip a display and takes it out of the hidden layout', () => {
        const block = printBlock();
        expect(block).toMatch(/\.handover-slip\s*\{[\s\S]*?display:\s*block/);
        expect(block).toMatch(/\.handover-slip\s*\{[\s\S]*?position:\s*absolute/);
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
