/**
 * `AC16` — the completion latch, asserted at source.
 *
 * ⚠️ SOURCE-SCAN, AND THE LIMIT OF THAT IS STATED: `AuraChat` is not rendered by
 *    any test in this repo (its import chain drags in jsPDF and html2canvas —
 *    the `AC5` note), so this suite proves the latch is WIRED, not that React
 *    behaves. Comments are stripped first (`AC5`'s own lesson: a fix's
 *    explanatory comment quotes the code it replaced).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const codeOnly = (text) => text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join('\n');

const src = codeOnly(readFileSync(resolve(process.cwd(), 'src/components/AuraChat.jsx'), 'utf8'));

describe('AC16 — the double-submit latch on the completion branch', () => {
    it('is a ref, because a same-tick second tap cannot see a setState latch', () => {
        expect(src).toMatch(/const concludingRef\s*=\s*useRef\(false\)/);
    });

    it('the submission guard checks it alongside isTyping and isComplete', () => {
        const guard = src.match(/if \(!text\.trim\(\)[^\n]*\) return;/);
        expect(guard).not.toBeNull();
        expect(guard[0]).toContain('isTyping');
        expect(guard[0]).toContain('isComplete');
        expect(guard[0]).toContain('concludingRef.current');
    });

    it('latches BEFORE concludeTriage is invoked, in the same synchronous run', () => {
        const branch = src.slice(src.indexOf('Generating your personalised plan now'));
        const set = branch.indexOf('concludingRef.current = true');
        const call = branch.indexOf('concludeTriage(updatedData)');
        expect(set).toBeGreaterThan(-1);
        expect(call).toBeGreaterThan(-1);
        expect(set).toBeLessThan(call);
    });

    it('unlatches ONLY in the failure path, so a failed completion is retryable', () => {
        // Exactly one reset, and it lives in the catch — after the failure log,
        // before the error message. A reset on the success path would reopen the
        // window this latch exists to close.
        const resets = src.match(/concludingRef\.current = false/g) || [];
        expect(resets.length).toBe(1);
        const catchBlock = src.slice(
            src.indexOf('completion failed; progress kept for resume'),
            src.indexOf('const showQuickReplies'),
        );
        expect(catchBlock).toContain('concludingRef.current = false');
    });

    it('the success path never unlatches — latched until the navigate', () => {
        const success = src.slice(
            src.indexOf('clearProgress();', src.indexOf('const concludeTriage')),
            src.indexOf('} catch (err)', src.indexOf('const concludeTriage')),
        );
        expect(success).not.toContain('concludingRef.current = false');
    });
});
