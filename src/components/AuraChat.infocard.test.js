/**
 * `AURA-TODO.md` P9.3 — the persistent info-card link in the public chat header.
 *
 * ⚠️ SOURCE-SCAN, AND THE LIMIT OF THAT IS STATED: `AuraChat` is not rendered by
 *    any test in this repo (its import chain drags in jsPDF and html2canvas —
 *    the `AC5` note, same as `AuraChat.latch.test.js`), so this suite proves the
 *    link is WIRED, not that React renders it. The rendered halves of P9.2/P9.3
 *    are covered by `AuraPulseBot.infocard.test.jsx` and
 *    `PathwaySelection.infocard.test.jsx`, which do mount their components.
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

describe('P9.3 — the header carries a persistent link to the chatbot info card', () => {
    it('links to /aura-info', () => {
        expect(src).toContain('href="/aura-info"');
    });

    it('opens in a new tab, so the assessment in progress is not abandoned', () => {
        // Scoped to the header anchor: from the href to the closing tag.
        const anchor = src.slice(src.indexOf('href="/aura-info"'), src.indexOf('</a>', src.indexOf('href="/aura-info"')));
        expect(anchor).toContain('target="_blank"');
        expect(anchor).toContain('rel="noopener noreferrer"');
    });

    it('is labelled for assistive tech as the card, not as decoration', () => {
        expect(src).toContain('aria-label="About this AI assistant: Chatbot Info Card"');
    });
});
