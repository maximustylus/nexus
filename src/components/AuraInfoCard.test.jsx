/**
 * ==============================================================================
 * AURA INFO CARD PAGE — ONE SOURCE, RENDERED HONESTLY (`AURA-TODO.md` P9.2/P9.3)
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/AuraInfoCard.test.jsx
 *
 * The page's whole design is that `docs/AURA-CHATBOT-INFO-CARD.md` is the only
 * copy of the card. So the claims pinned here are:
 *
 *   1. THE REAL CONTROLLED DOCUMENT RENDERS — not a fixture. The page's dynamic
 *      import resolves the actual file, so renaming or moving the document
 *      breaks this test rather than silently serving a blank page.
 *   2. REPO-RELATIVE LINKS DO NOT BECOME ANCHORS. `AURA-GUARDRAILS.md` is a
 *      citation, not a URL; an <a href="AURA-GUARDRAILS.md"> would 404 through
 *      the SPA catch-all for every member of the public.
 *   3. External http(s) links ARE anchors, and open in a new tab.
 *   4. GFM tables render as tables — the card's disclosure sections are tables,
 *      and without `remark-gfm` they degrade to a paragraph of pipes.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import AuraInfoCard from './AuraInfoCard';

afterEach(cleanup);

/** A minimal card exercising every construct the renderer must handle. */
const FIXTURE = [
    '# Fixture Card',
    '',
    'A repo citation: [`AURA-GUARDRAILS.md`](AURA-GUARDRAILS.md).',
    '',
    'A web link: [IMDA site](https://www.example.org/imda).',
    '',
    '| Col A | Col B |',
    '|---|---|',
    '| cell one | cell two |',
].join('\n');

describe('rendering rules, on a fixture', () => {
    it('renders a repo-relative link as a citation, never an anchor', () => {
        render(<AuraInfoCard source={FIXTURE} />);

        const citation = screen.getByText('AURA-GUARDRAILS.md');
        expect(citation.closest('a')).toBeNull();
        expect(citation.closest('code')).not.toBeNull();
    });

    it('renders an external link as an anchor that opens in a new tab', () => {
        render(<AuraInfoCard source={FIXTURE} />);

        const anchor = screen.getByRole('link', { name: 'IMDA site' });
        expect(anchor.getAttribute('href')).toBe('https://www.example.org/imda');
        expect(anchor.getAttribute('target')).toBe('_blank');
        expect(anchor.getAttribute('rel')).toContain('noopener');
    });

    it('renders a GFM table as a real table', () => {
        render(<AuraInfoCard source={FIXTURE} />);

        expect(screen.getByRole('table')).toBeTruthy();
        expect(screen.getByRole('columnheader', { name: 'Col A' })).toBeTruthy();
        expect(screen.getByRole('cell', { name: 'cell two' })).toBeTruthy();
    });
});

describe('the real controlled document', () => {
    it('loads and renders docs/AURA-CHATBOT-INFO-CARD.md itself', async () => {
        render(<AuraInfoCard />);

        // The card's own H1 — if the document moves or its title changes, this
        // fails here instead of shipping a page that says "Loading…" forever.
        expect(
            await screen.findByRole('heading', {
                level: 1,
                name: /Chatbot Info Card .* AURA/i,
            }),
        ).toBeTruthy();

        // The heading of each of the four IMDA disclosure areas, so gutting a
        // section is visible as a test failure, not just a diff. `getAll` because
        // prose elsewhere on the card may repeat a heading's words.
        expect((await screen.findAllByText(/What AURA does/i)).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Safety and reliability/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Data practices/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Feedback and reporting/i).length).toBeGreaterThan(0);
    });
});
