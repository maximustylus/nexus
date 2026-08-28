/**
 * ==============================================================================
 * PATHWAY SELECTION — THE PUBLIC FIRST-USE SAFETY STATEMENT (`AURA-TODO.md` P9.2)
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/PathwaySelection.infocard.test.jsx
 *
 * This screen is the last point common to both public pathways before the first
 * health question — the same reasoning that put the collection notice here. The
 * claims pinned:
 *
 *   1. The AI is named for what it is (a generative AI assistant, Google Gemini)
 *      BEFORE a pathway is chosen, with the two load-bearing caveats: the result
 *      comes from fixed scoring rules, and it is not medical advice.
 *   2. The statement links to `/aura-info` in a new tab.
 *   3. The collection notice it joined is still there — this was an addition to
 *      that panel, not a replacement of it.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import PathwaySelection from './PathwaySelection';

beforeEach(() => {
    localStorage.clear();
    // jsdom has no matchMedia; the component reads it for the theme initialiser.
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(cleanup);

const renderScreen = () => render(
    <MemoryRouter initialEntries={['/individuals/pathway']}>
        <PathwaySelection />
    </MemoryRouter>,
);

describe('the AI safety statement before either pathway starts', () => {
    it('names the AI, the fixed scoring, and the not-medical-advice caveat', () => {
        renderScreen();

        expect(screen.getByText(/generative AI assistant/i)).toBeTruthy();
        expect(screen.getByText(/fixed\s+scoring rules/i)).toBeTruthy();
        expect(screen.getByText(/not medical advice or a diagnosis/i)).toBeTruthy();
    });

    it('links to the chatbot info card in a new tab', () => {
        renderScreen();

        const link = screen.getByRole('link', { name: /chatbot info card/i });
        expect(link.getAttribute('href')).toBe('/aura-info');
        expect(link.getAttribute('target')).toBe('_blank');
        expect(link.getAttribute('rel')).toContain('noopener');
    });

    it('did not displace the collection notice it joined', () => {
        renderScreen();

        expect(screen.getByText(/de-identified at the point of capture/i)).toBeTruthy();
        expect(screen.getByText(/24 months/i)).toBeTruthy();
    });
});
