/**
 * ==============================================================================
 * ROSTER VIEW — THE MOBILE LAYOUT CONTRACT
 * ==============================================================================
 * Runner: Vitest + @testing-library/react (jsdom)
 * Run:    npx vitest run src/components/RosterView.mobile.test.jsx
 *
 * MOST PEOPLE WHO TRY THIS SANDBOX WILL TRY IT ON A PHONE — colleagues from four
 * other departments, on their own devices, forming their first impression of the
 * product. That makes the phone layout a deploy gate, and this file is it.
 *
 * ⚠️ WHAT THIS FILE CANNOT DO, STATED FIRST. jsdom paints nothing and loads no
 * stylesheet: `hidden` does not hide, `sm:` does not resolve, and no element has a
 * width. So nothing here can tell you whether the stacked card LOOKS right at
 * 375px, whether the spacing reads, whether a thumb lands where it should, or
 * whether the contrast holds. Those need a human with a phone and are listed as
 * such in the report. What IS checkable — and is checked, exhaustively, by walking
 * the rendered DOM rather than by asserting one control at a time — is:
 *
 *   1. EVERY focusable field declares ≥16px text on a phone. Under 16px, iOS
 *      Safari zooms the whole page on focus and does not zoom back: the visitor is
 *      left at 1.4× with the modal they were filling in off the side of the screen.
 *      Measured as an EFFECTIVE size — the nearest declared unprefixed `text-*`
 *      class walking up the tree — because a field with no size class of its own
 *      inherits one.
 *   2. EVERY interactive control declares a minimum height of at least 44px on a
 *      phone, the floor both Apple's HIG and Material put a touch target at.
 *   3. THE TWO LAYOUTS ARE ONE MARKUP TREE. The stacked-card classes and the
 *      table classes are on the SAME elements, with the responsive prefixes that
 *      switch between them — and no `aria-label` in the wizard appears twice,
 *      which is the property that fails the moment somebody "fixes" mobile by
 *      forking the row into a second, divergent renderer.
 *   4. EVERY field still has an accessible name, by `aria-label` or by a
 *      `<label htmlFor>` pointing at its `id`.
 *   5. NOTHING scrolls sideways on a phone: no unconditional `overflow-x-auto`
 *      survives inside the wizard.
 *   6. LIVE MODE IS UNTOUCHED. The live wizard panel's class string is asserted
 *      here as well as in `RosterView.wizard.test.jsx`, because the responsive
 *      work had to branch on `isDemo` to leave it alone and a branch is exactly
 *      what quietly stops being taken.
 *
 * The walkers below are deliberately EXHAUSTIVE rather than a list of the controls
 * somebody remembered. A control added to the wizard next month is covered by this
 * file on the day it is added, or it turns it red.
 * ==============================================================================
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

// --- MOCKS (hoisted above the imports below by Vitest) ------------------------

const ctx = vi.hoisted(() => ({ isDemo: true }));

vi.mock('../firebase', () => ({
    db: { __mock: 'firestore-db' },
    auth: { __mock: 'auth' },
    storage: { __mock: 'storage' },
    messaging: { __mock: 'messaging' },
    requestForToken: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
    doc: vi.fn(() => ({ __mock: 'docRef' })),
    collection: vi.fn(() => ({ __mock: 'collectionRef' })),
    onSnapshot: vi.fn(() => () => {}),
    setDoc: vi.fn(() => Promise.resolve()),
    addDoc: vi.fn(() => Promise.resolve({ id: 'mock' })),
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    serverTimestamp: vi.fn(() => 'mock-timestamp'),
    query: vi.fn(() => ({ __mock: 'query' })),
    where: vi.fn(() => ({ __mock: 'where' })),
    updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../context/NexusContext', () => ({
    useNexus: () => ({ isDemo: ctx.isDemo }),
    NexusProvider: ({ children }) => children,
}));

import { setDoc } from 'firebase/firestore';
import RosterView from './RosterView';

const VISITOR = { name: 'Visiting Therapist', role: 'staff', email: 'visitor@example.org' };

// --- THE MEASUREMENT LAYER ---------------------------------------------------
//
// Tailwind classes are strings in jsdom, so these read the strings. That is not a
// weakness of the approach — the class list IS the declaration, and a declaration
// is what a responsive contract is made of. What it cannot see is the result of
// the cascade, which is why the effective-size walk below climbs ancestors instead
// of trusting each element to declare its own size.

/** Tailwind's named text sizes, in px. */
const NAMED_TEXT_PX = Object.freeze({
    xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36,
});

/** Tailwind's spacing scale: `11` -> 44px, `2.5` -> 10px. */
const spacingPx = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n * 4 : null;
};

const classList = (el) =>
    (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean);

/**
 * The classes that apply on a PHONE: everything with no variant prefix at all.
 *
 * A `sm:`, `md:`, `dark:` or `hover:` prefixed class is not in force at 375px in
 * the default state, so it cannot be what makes a field 16px there. `!` (Tailwind's
 * important modifier) is stripped — it changes who wins the cascade, not when.
 */
const mobileClasses = (el) =>
    classList(el)
        .filter((token) => !token.includes(':'))
        .map((token) => token.replace(/^!/, ''));

/** The font size a token declares, in px, or null if it declares none. */
const textSizeOf = (token) => {
    const named = /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl)$/.exec(token);
    if (named) return NAMED_TEXT_PX[named[1]];
    const arbitraryPx = /^text-\[(\d+(?:\.\d+)?)px\]$/.exec(token);
    if (arbitraryPx) return Number(arbitraryPx[1]);
    const arbitraryRem = /^text-\[(\d+(?:\.\d+)?)rem\]$/.exec(token);
    if (arbitraryRem) return Number(arbitraryRem[1]) * 16;
    return null;
};

/**
 * The font size in force on `el` at phone width, in px.
 *
 * Climbs to the first ancestor that declares one, and falls back to 16 — the root
 * size Tailwind's preflight sets and every browser's default. So a field with no
 * `text-*` class of its own is judged by what it actually inherits, not excused.
 */
const effectiveMobileFontPx = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
        for (const token of mobileClasses(node)) {
            const px = textSizeOf(token);
            if (px !== null) return px;
        }
        node = node.parentElement;
    }
    return 16;
};

/** Does this element declare a height floor of at least 44px on a phone? */
const declaresTouchHeight = (el) => {
    for (const token of mobileClasses(el)) {
        const minSpacing = /^min-h-(\d+(?:\.\d+)?)$/.exec(token);
        if (minSpacing && spacingPx(minSpacing[1]) >= 44) return true;
        const minArbitrary = /^min-h-\[(\d+(?:\.\d+)?)px\]$/.exec(token);
        if (minArbitrary && Number(minArbitrary[1]) >= 44) return true;
        const fixed = /^h-(\d+(?:\.\d+)?)$/.exec(token);
        if (fixed && spacingPx(fixed[1]) >= 44) return true;
        if (token === 'h-full' || token === 'h-screen') return true;
    }
    return false;
};

/** Every `<input>`, `<select>` and `<textarea>` on screen — the fields iOS zooms for. */
const focusableFields = (root = document.body) =>
    Array.from(root.querySelectorAll('input, select, textarea'))
        .filter((el) => el.type !== 'hidden');

/**
 * Every control a finger has to land on.
 *
 * `role="slider"` is in the list because the band ruler's dividers are `<div>`s
 * carrying the slider role and keyboard handling — the one control in this app
 * where "interactive" is not the same question as "is it a `<button>`".
 */
const touchTargets = (root = document.body) =>
    Array.from(root.querySelectorAll('button, select, input, textarea, [role="slider"]'))
        .filter((el) => el.type !== 'hidden');

/** The accessible name of a field, by `aria-label` or by a `<label htmlFor>`. */
const accessibleNameOf = (el) => {
    const aria = el.getAttribute('aria-label');
    if (aria && aria.trim() !== '') return aria.trim();
    if (el.id) {
        const label = document.querySelector(`label[for="${el.id}"]`);
        if (label && label.textContent.trim() !== '') return label.textContent.trim();
    }
    const wrapping = el.closest('label');
    if (wrapping && wrapping.textContent.trim() !== '') return wrapping.textContent.trim();
    return null;
};

/** A readable identity for a failure message — the class walk alone is unreadable. */
const describe1 = (el) =>
    `<${el.tagName.toLowerCase()}${el.id ? ` id="${el.id}"` : ''}${
        el.getAttribute('aria-label') ? ` aria-label="${el.getAttribute('aria-label')}"` : ''
    }> class="${el.className}"`;

// --- DRIVING THE WIZARD OPEN ------------------------------------------------

const openConfigure = () =>
    fireEvent.click(screen.getByRole('button', { name: /configure/i }));

const wizard = () => document.querySelector('[data-overlay="roster-config-wizard"]');

/**
 * Open the wizard with EVERY control on screen.
 *
 * Two staff names (the "never on the same shift" picker renders nothing under two),
 * both drawers expanded, and the second task switched to slot mode and monthly so
 * the controls those two modes REPLACE are covered as well. A phone-layout gate
 * that only ever saw the closed row would miss two thirds of the wizard's fields.
 */
const openFullWizard = () => {
    openConfigure();
    fireEvent.change(screen.getByLabelText('Staff row 1 name'), { target: { value: 'Peter Parker' } });
    fireEvent.click(screen.getAllByRole('button', { name: /add row/i })[0]);
    fireEvent.change(screen.getByLabelText('Staff row 2 name'), { target: { value: 'Carol Danvers' } });
    fireEvent.click(screen.getByLabelText('Staff row 1: limits and availability'));
    fireEvent.click(screen.getByRole('button', { name: 'Add availability window to person 1' }));
    fireEvent.click(screen.getByLabelText('Task row 1: hours and staffing'));
};

const openSlotAndMonthlyWizard = () => {
    openFullWizard();
    fireEvent.click(screen.getByLabelText('Task row 1: staffed as a team of slots'));
    fireEvent.click(screen.getByLabelText('Task row 1: repeats once a month'));
};

beforeEach(() => {
    vi.clearAllMocks();
    ctx.isDemo = true;
});

afterEach(() => {
    cleanup();
});

// ─── 1. NO FOCUSABLE FIELD IS UNDER 16px ON A PHONE ───────────────────────────

describe('the sandbox wizard: iOS Safari has nothing to zoom for', () => {
    it('gives every field in the wizard an effective 16px or more on a phone', () => {
        render(<RosterView user={VISITOR} />);
        openFullWizard();

        const fields = focusableFields(wizard());
        // A guard on the guard: if the wizard ever stops rendering its tables this
        // assertion would pass over an empty list and say nothing at all.
        expect(fields.length).toBeGreaterThan(15);

        const tooSmall = fields
            .filter((el) => effectiveMobileFontPx(el) < 16)
            .map((el) => `${effectiveMobileFontPx(el)}px  ${describe1(el)}`);

        expect(tooSmall).toEqual([]);
    });

    it('covers the fields that only exist in slot mode and monthly mode too', () => {
        render(<RosterView user={VISITOR} />);
        openSlotAndMonthlyWizard();

        // The slot band/skill pair and the two monthly dropdowns are on screen now.
        expect(screen.getByLabelText('Task row 1 slot 1 band')).toBeTruthy();
        expect(screen.getByLabelText('Task row 1 week of the month')).toBeTruthy();

        const tooSmall = focusableFields(wizard())
            .filter((el) => effectiveMobileFontPx(el) < 16)
            .map((el) => `${effectiveMobileFontPx(el)}px  ${describe1(el)}`);

        expect(tooSmall).toEqual([]);
    });

    it('drops back to the dense size from `sm:` up rather than shouting on a desktop', () => {
        render(<RosterView user={VISITOR} />);
        openFullWizard();

        // `text-base sm:text-xs` is the idiom. The point of the assertion is that the
        // 16px is a PHONE rule and not a permanent restyle of the whole wizard.
        const named = screen.getByLabelText('Staff row 1 name');
        expect(named.className).toContain('text-base');
        expect(named.className).toContain('sm:text-xs');
    });

    it('gives the swap modal\'s own fields the same floor', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.change(screen.getByLabelText('Staff row 1 name'), { target: { value: 'Peter Parker' } });
        fireEvent.change(screen.getByLabelText('Task row 1 name'), { target: { value: 'Clinic' } });
        fireEvent.click(screen.getByRole('button', { name: /^draft roster$/i }));

        // Any generated shift will do: the modal is the same one for all of them.
        const shift = document.querySelector('[data-date] button');
        expect(shift).toBeTruthy();
        fireEvent.click(shift);

        const modal = document.querySelector('[data-overlay="swap-modal"]');
        expect(modal).toBeTruthy();
        const tooSmall = focusableFields(modal)
            .filter((el) => effectiveMobileFontPx(el) < 16)
            .map((el) => `${effectiveMobileFontPx(el)}px  ${describe1(el)}`);
        expect(tooSmall).toEqual([]);
    });
});

// ─── 2. EVERY CONTROL IS 44px TALL ON A PHONE ─────────────────────────────────

describe('the sandbox wizard: every control is thumb-sized on a phone', () => {
    it('declares a 44px height floor on every interactive element in the wizard', () => {
        render(<RosterView user={VISITOR} />);
        openFullWizard();

        const targets = touchTargets(wizard());
        expect(targets.length).toBeGreaterThan(30);

        const tooSmall = targets.filter((el) => !declaresTouchHeight(el)).map(describe1);
        expect(tooSmall).toEqual([]);
    });

    it('covers slot mode and monthly mode', () => {
        render(<RosterView user={VISITOR} />);
        openSlotAndMonthlyWizard();

        const tooSmall = touchTargets(wizard())
            .filter((el) => !declaresTouchHeight(el))
            .map(describe1);
        expect(tooSmall).toEqual([]);
    });

    it('gives the band ruler\'s dividers a genuine 44x44 hit area, and keeps the keyboard', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // EVERY handle, however many bands the scale declares — three dividers since
        // the four-band split, and a destructured pair would have stopped checking
        // the topmost one the moment a band was added below it.
        const handles = screen.getAllByRole('slider');
        expect(handles).toHaveLength(3);

        // The HIT AREA is what a finger lands on, so it is the box that grows — the
        // visible grip stays a hairline so the ruler still reads as a ruler.
        for (const handle of handles) {
            expect(handle.className).toContain('h-11');
            expect(handle.className).toContain('w-11');
            // …and relaxes on a desktop, where a mouse wants precision and two 44px
            // boxes one grade apart would overlap.
            expect(handle.className).toContain('sm:h-10');
            expect(handle.className).toContain('sm:w-6');
            // Unchanged: the drag must not become a page scroll on touch.
            expect(handle.className).toContain('touch-none');
        }

        // THE KEYBOARD SUPPORT IS UNTOUCHED. The whole point of the ruler is that it
        // is operable without a pointer, and a touch-target change must not cost it.
        //
        // Driven on the junior|senior divider, asked for by the bands it sits between:
        // `getAllByRole('slider')[0]` was that divider before the four-band split and
        // is the non-exempt|junior one now, so an index would have kept passing while
        // measuring a different handle.
        const juniorSenior = screen.getByLabelText('Boundary between the Junior and Senior bands');
        const seniorPrincipal = screen.getByLabelText('Boundary between the Senior and Principal bands');

        expect(juniorSenior.getAttribute('role')).toBe('slider');
        expect(juniorSenior.getAttribute('tabindex')).toBe('0');
        expect(juniorSenior.getAttribute('aria-valuenow')).toBe('12');
        fireEvent.keyDown(juniorSenior, { key: 'ArrowLeft' });
        expect(juniorSenior.getAttribute('aria-valuenow')).toBe('11');
        fireEvent.keyDown(juniorSenior, { key: 'End' });
        expect(juniorSenior.getAttribute('aria-valuenow')).toBe('13');
        fireEvent.keyDown(juniorSenior, { key: 'Home' });
        // CHANGED BY THE FOUR-BAND SPLIT: Home lands on AH11, not AH7. Non-exempt is
        // the bottom band now, so this divider's floor is one grade above the divider
        // below it — the same published `aria-valuemin` Home has always jumped to.
        expect(juniorSenior.getAttribute('aria-valuenow')).toBe('11');
        expect(seniorPrincipal.getAttribute('aria-valuenow')).toBe('14');
    });

    it('makes the roster card\'s own controls thumb-sized as well', () => {
        render(<RosterView user={VISITOR} />);

        // The header row: two view buttons, two month arrows, Configure, CSV, ICS.
        const header = screen.getByRole('button', { name: /configure/i }).closest('div');
        const tooSmall = touchTargets(header).filter((el) => !declaresTouchHeight(el)).map(describe1);
        expect(tooSmall).toEqual([]);

        for (const name of [/^previous month$/i, /^next month$/i]) {
            const arrow = screen.getByRole('button', { name });
            expect(declaresTouchHeight(arrow)).toBe(true);
            expect(arrow.className).toContain('min-w-11');
        }
    });
});

// ─── 3. ONE MARKUP TREE, TWO LAYOUTS ─────────────────────────────────────────

describe('the sandbox wizard: the stacked card and the table are the same elements', () => {
    /** The wizard's two tables, in DOM order: staff, then tasks. */
    const wizardTables = () => Array.from(wizard().querySelectorAll('table'));

    it('switches the table, header, rows and cells by responsive prefix', () => {
        render(<RosterView user={VISITOR} />);
        openFullWizard();

        const tables = wizardTables();
        expect(tables).toHaveLength(2);

        for (const table of tables) {
            // The table itself: a block on a phone, a table from `sm:` up.
            expect(table.className).toContain('block');
            expect(table.className).toContain('sm:table');

            // The header row is the one thing that is genuinely absent on a phone —
            // its job (naming the column) has moved into the cards.
            const head = table.querySelector('thead');
            expect(head.className).toContain('hidden');
            expect(head.className).toContain('sm:table-header-group');
            expect(table.querySelector('tbody').className).toContain('block');
            expect(table.querySelector('tbody').className).toContain('sm:table-row-group');

            for (const row of Array.from(table.querySelectorAll('tbody tr'))) {
                expect(row.className).toContain('block');
                expect(row.className).toContain('sm:table-row');
            }
            for (const cell of Array.from(table.querySelectorAll('tbody td'))) {
                expect(cell.className).toContain('block');
                expect(cell.className).toContain('sm:table-cell');
            }
        }
    });

    it('prints each column\'s heading inside the card, from the same string as the `<th>`', () => {
        render(<RosterView user={VISITOR} />);
        openFullWizard();

        const [staff, tasks] = wizardTables();

        // Every heading in the header row appears again as an in-card label, hidden
        // from `sm:` up — which is what makes a stacked cell readable without the
        // column it came from.
        const inCardLabels = (table) =>
            Array.from(table.querySelectorAll('tbody td > span.sm\\:hidden'))
                .map((span) => span.textContent.trim());

        const headings = (table) =>
            Array.from(table.querySelectorAll('thead th'))
                .map((th) => th.textContent.trim())
                .filter((text) => text !== '');

        for (const table of [staff, tasks]) {
            const labels = inCardLabels(table);
            expect(labels.length).toBeGreaterThan(0);
            for (const heading of headings(table)) {
                expect(labels).toContain(heading);
            }
        }
    });

    it('leaves the in-card label out of the accessibility tree, so no field is named twice', () => {
        render(<RosterView user={VISITOR} />);
        openFullWizard();

        for (const span of Array.from(wizard().querySelectorAll('tbody td > span.sm\\:hidden'))) {
            expect(span.getAttribute('aria-hidden')).toBe('true');
        }

        // …and the fields still carry the names every other test reaches them by.
        expect(screen.getByLabelText('Staff row 1 name')).toBeTruthy();
        expect(screen.getByLabelText('Staff row 1 job grade')).toBeTruthy();
        expect(screen.getByLabelText('Task row 1: Senior may lead')).toBeTruthy();
        expect(screen.getByLabelText('Task row 1: hours and staffing')).toBeTruthy();
    });

    it('has exactly one element per `aria-label` — the row was not forked in two', () => {
        render(<RosterView user={VISITOR} />);
        openSlotAndMonthlyWizard();

        const seen = new Map();
        for (const el of Array.from(wizard().querySelectorAll('[aria-label]'))) {
            const name = el.getAttribute('aria-label');
            seen.set(name, (seen.get(name) || 0) + 1);
        }
        const duplicated = Array.from(seen.entries())
            .filter(([, count]) => count > 1)
            .map(([name, count]) => `${name} ×${count}`);

        // A mobile card list rendered BESIDE the desktop table would put every label
        // on screen twice. This is the assertion that catches that refactor.
        expect(duplicated).toEqual([]);
    });

    it('gives every field an accessible name, stacked or not', () => {
        render(<RosterView user={VISITOR} />);
        openSlotAndMonthlyWizard();

        const unnamed = focusableFields(wizard())
            .filter((el) => accessibleNameOf(el) === null)
            .map(describe1);
        expect(unnamed).toEqual([]);
    });

    it('keeps every `htmlFor`/`id` pairing in the drawers pointing at a real field', () => {
        render(<RosterView user={VISITOR} />);
        openSlotAndMonthlyWizard();

        const labels = Array.from(wizard().querySelectorAll('label[for]'));
        expect(labels.length).toBeGreaterThan(5);
        for (const label of labels) {
            const target = document.getElementById(label.getAttribute('for'));
            expect(target, `<label for="${label.getAttribute('for')}"> points at nothing`).toBeTruthy();
            expect(['INPUT', 'SELECT', 'TEXTAREA']).toContain(target.tagName);
        }
    });
});

// ─── 4. NOTHING SCROLLS SIDEWAYS ON A PHONE ──────────────────────────────────

describe('the sandbox: no horizontal scroller on a phone', () => {
    it('has no unconditional `overflow-x-auto` anywhere in the wizard', () => {
        render(<RosterView user={VISITOR} />);
        openFullWizard();

        const unconditional = Array.from(wizard().querySelectorAll('*'))
            .filter((el) => mobileClasses(el).includes('overflow-x-auto'))
            .map(describe1);
        expect(unconditional).toEqual([]);
    });

    it('keeps the scroller as a `sm:`-gated safety net for the narrow-tablet table', () => {
        render(<RosterView user={VISITOR} />);
        openFullWizard();

        const gated = Array.from(wizard().querySelectorAll('*'))
            .filter((el) => classList(el).includes('sm:overflow-x-auto'));
        // One per table: the row is a card below `sm:` and a table above it.
        expect(gated).toHaveLength(2);
    });

    it('has no unconditional `overflow-x-auto` in the result panel either', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.change(screen.getByLabelText('Staff row 1 name'), { target: { value: 'Peter Parker' } });
        fireEvent.change(screen.getByLabelText('Task row 1 name'), { target: { value: 'Clinic' } });
        fireEvent.click(screen.getByRole('button', { name: /^draft roster$/i }));

        // The load table is on screen now.
        expect(screen.getByText(/load per person/i)).toBeTruthy();
        const unconditional = Array.from(document.querySelectorAll('*'))
            .filter((el) => mobileClasses(el).includes('overflow-x-auto'))
            .map(describe1);
        expect(unconditional).toEqual([]);
    });

    it('stacks the load table\'s rows and labels every figure with its column', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.change(screen.getByLabelText('Staff row 1 name'), { target: { value: 'Peter Parker' } });
        fireEvent.change(screen.getByLabelText('Task row 1 name'), { target: { value: 'Clinic' } });
        fireEvent.click(screen.getByRole('button', { name: /^draft roster$/i }));

        const table = screen.getByText(/load per person/i).closest('div').querySelector('table');
        expect(table.className).toContain('block');
        expect(table.className).toContain('sm:table');
        expect(table.querySelector('thead').className).toContain('hidden');

        const row = table.querySelector('tbody tr');
        expect(row.className).toContain('block');
        expect(row.className).toContain('sm:table-row');

        // The headings the `<th>` row carries are the labels the cards carry, from
        // one object — so `loadTableHeadings()` in the demo suite and the cards can
        // never describe different columns.
        const headings = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
        const cardLabels = Array.from(row.querySelectorAll('td > span[aria-hidden="true"]'))
            .map((span) => span.textContent.trim());
        expect(headings).toContain('Per FTE');
        for (const heading of headings.filter((text) => text !== 'Name')) {
            expect(cardLabels).toContain(heading);
        }
    });
});

// ─── 5. THE WIZARD MODAL IS FULL-SCREEN BELOW `sm:` ──────────────────────────

describe('the sandbox wizard modal: full-screen on a phone, dialog on a desktop', () => {
    const panel = () => wizard().firstElementChild;

    it('fills the screen below `sm:` and becomes a centred dialog above it', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // The overlay stops padding the panel away from the edges on a phone.
        expect(wizard().className).toContain('p-0');
        expect(wizard().className).toContain('sm:p-4');
        expect(wizard().className).toContain('items-stretch');
        expect(wizard().className).toContain('sm:items-center');

        const box = panel().className;
        // Full height and no wasted chrome on a phone…
        expect(box).toContain('h-full');
        expect(box).toContain('rounded-none');
        expect(box).toContain('border-0');
        // …its own internal scroll rather than the page's…
        expect(box).toContain('overflow-y-auto');
        // …and the notch padded for, using the same `env()` idiom as ResponsiveLayout.
        expect(box).toContain('pt-[max(1rem,env(safe-area-inset-top))]');
        // …reverting to the centred 3xl dialog from `sm:` up.
        expect(box).toContain('sm:h-auto');
        expect(box).toContain('sm:max-h-[90vh]');
        expect(box).toContain('sm:rounded-2xl');
        expect(box).toContain('max-w-3xl');
    });

    it('pins Draft and Cancel to the bottom of the screen on a phone', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        const footer = screen.getByRole('button', { name: /^draft roster$/i }).parentElement;
        expect(within(footer).getByRole('button', { name: /^cancel$/i })).toBeTruthy();

        // Sticky, not fixed: it rides the panel's own scrollport, so it cannot end up
        // floating over a page that is not the wizard.
        expect(footer.className).toContain('sticky');
        expect(footer.className).toContain('bottom-0');
        // A rule and an opaque background, or the tables would scroll through it.
        expect(footer.className).toContain('border-t');
        expect(footer.className).toContain('bg-white');
        // The home bar / gesture area on a notched phone.
        expect(footer.className).toContain('pb-[max(1rem,env(safe-area-inset-bottom))]');
        // …and an ordinary row in the flow again from `sm:` up.
        expect(footer.className).toContain('sm:static');
    });

    it('makes the run fields 16px on a phone with `!`, because `.input-field` outranks them', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // `.input-field` is declared in `src/style.css` AFTER `@tailwind utilities`,
        // so its `text-sm` beats a plain `text-base` on source order. The important
        // modifier is the only thing that actually changes the rendered size, and a
        // test that accepted `text-base` here would pass while iOS still zoomed.
        for (const id of ['roster-start-date', 'roster-weeks']) {
            const field = document.getElementById(id);
            expect(field.className).toContain('input-field');
            expect(field.className).toContain('!text-base');
            expect(field.className).toContain('sm:!text-sm');
            expect(declaresTouchHeight(field)).toBe(true);
        }
    });

    it('is still the sandbox\'s own picker dropdowns that set the idiom', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        // TWO dropdowns now — a profession and a shape — and BOTH are asserted, because
        // they share one pair of class constants precisely so they cannot drift into two
        // different touch targets. Checking only one would let the other regress.
        for (const label of [/your profession/i, /shape to start from/i]) {
            const picker = screen.getByLabelText(label);
            expect(picker.className).toContain('min-h-11');
            expect(picker.className).toContain('text-base');
            expect(picker.className).toContain('sm:text-sm');
        }
    });
});

// ─── 6. THE CALENDAR AT 375px ────────────────────────────────────────────────

describe('the calendar grid: seven columns on a desktop, a list on a phone', () => {
    it('lays the month out in one column below `sm:` and seven above it', () => {
        render(<RosterView user={VISITOR} />);

        const grid = document.querySelector('[data-date]').parentElement;
        expect(grid.className).toContain('grid-cols-1');
        expect(grid.className).toContain('sm:grid-cols-7');
    });

    it('drops the fixed square and the inner scroller on a phone, and keeps them above `sm:`', () => {
        render(<RosterView user={VISITOR} />);

        const cell = document.querySelector('[data-date]');
        // A 128px square with a 90px scroll window inside it is a letterbox at 48px
        // wide. On a phone the row is as tall as the day it holds.
        expect(cell.className).toContain('sm:h-32');
        expect(cell.className).not.toMatch(/(^|\s)h-32(\s|$)/);

        const scroller = cell.querySelector('.custom-scrollbar');
        expect(scroller.className).toContain('sm:overflow-y-auto');
        expect(scroller.className).toContain('sm:max-h-[90px]');
        expect(scroller.className).not.toMatch(/(^|\s)overflow-y-auto(\s|$)/);
    });

    it('names each row\'s weekday on a phone, because the column headings are gone', () => {
        render(<RosterView user={VISITOR} />);

        // The seven headings exist for the grid and are hidden on a phone…
        const headings = Array.from(document.querySelectorAll('[data-date]')[0]
            .parentElement.children)
            .filter((el) => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/.test(el.textContent.trim()));
        expect(headings).toHaveLength(7);
        for (const heading of headings) {
            expect(heading.className).toContain('hidden');
            expect(heading.className).toContain('sm:block');
        }

        // …so every day names its own. Read off the DOM rather than computed here, so
        // the assertion cannot agree with a bug by repeating its arithmetic.
        for (const cell of Array.from(document.querySelectorAll('[data-date]'))) {
            const dateKey = cell.getAttribute('data-date');
            const [y, m, d] = dateKey.split('-').map(Number);
            const expected = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(y, m - 1, d).getDay()];
            const shown = cell.querySelector('span > span.sm\\:hidden');
            expect(shown, `no weekday label in ${dateKey}`).toBeTruthy();
            expect(shown.textContent.trim()).toBe(expected);
        }
    });

    it('shows exactly the same shifts and gaps it always did, only laid out differently', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.change(screen.getByLabelText('Staff row 1 name'), { target: { value: 'Peter Parker' } });
        fireEvent.change(screen.getByLabelText('Task row 1 name'), { target: { value: 'Clinic' } });
        fireEvent.click(screen.getByRole('button', { name: /^draft roster$/i }));

        // The shift buttons are still one per shift, still carry the task as their
        // first line, and are now 44px tall.
        const buttons = Array.from(document.querySelectorAll('[data-date] button'));
        expect(buttons.length).toBeGreaterThan(0);
        for (const button of buttons) {
            expect(button.querySelector('span').textContent).toBe('Clinic');
            expect(declaresTouchHeight(button)).toBe(true);
            expect(button.className).toContain('text-xs');
            expect(button.className).toContain('sm:text-[9px]');
        }
    });
});

// ─── 7. LIVE MODE IS UNTOUCHED ───────────────────────────────────────────────
//
// Everything above is a sandbox change, and "sandbox only" is a claim about live
// mode that has to be asserted in live mode. `RosterView.wizard.test.jsx` owns the
// byte-for-byte pin on the two textareas; this is the pin on the parts the
// responsive work had to branch around.

describe('live mode: the responsive work stopped at the branch', () => {
    beforeEach(() => {
        ctx.isDemo = false;
    });

    /**
     * ⚠️ THIS TEST WAS THE INVERSE OF ITSELF, AND THE INVERSION IS THE POINT.
     *
     *    It asserted that live mode's wizard stayed `max-w-lg`, unpadded and
     *    NON-SCROLLING — correct while that panel held two textareas, and the whole
     *    reason this section was called "the responsive work stopped at the branch".
     *
     *    `R3` removed the branch: live mode now renders the same tables the sandbox
     *    does. Keeping the narrow non-scrolling panel would have crammed two tables
     *    and a band editor into it and pushed Generate off the bottom of a box that
     *    cannot scroll to reach it — a wizard nobody could finish. So the mobile
     *    treatment applies in both modes, which is what it always meant: it followed
     *    the tables, not the sandbox.
     */
    it('gives the live wizard the same scrolling, full-bleed panel the tables need', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        const box = screen.getByRole('button', { name: /^generate roster$/i })
            .closest('.overflow-y-auto');
        expect(box, 'the live wizard panel cannot scroll to its own Generate button').toBeTruthy();
        expect(box.className).toContain('max-w-3xl');
        expect(box.className).toContain('sm:max-h-[90vh]');

        // The two decisions stay reachable on a phone rather than sitting below a
        // page of tables.
        expect(screen.getByRole('button', { name: /^generate roster$/i }).parentElement.className)
            .toContain('sticky');
    });

    it('leaves the two shared run fields exactly as they were in live mode', () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();

        for (const id of ['roster-start-date', 'roster-weeks']) {
            expect(document.getElementById(id).className).toBe(
                'input-field w-full mt-1 font-bold bg-white dark:bg-slate-900 border dark:border-slate-700 rounded p-2 text-slate-800 dark:text-white',
            );
        }
        expect(setDoc).not.toHaveBeenCalled();
    });

    it('still shares the calendar improvements, which are not wizard changes', () => {
        render(<RosterView user={VISITOR} />);

        const grid = document.querySelector('[data-date]').parentElement;
        expect(grid.className).toContain('grid-cols-1');
        expect(grid.className).toContain('sm:grid-cols-7');
    });
});


/**
 * ==============================================================================
 * THE ROSTER TOOLBAR, AND THE ROW HEIGHTS IT USED TO GET WRONG
 *
 * Reported by the owner on 2026-09-01 and then MEASURED in a real 375px viewport
 * rather than argued about: the toolbar wrapped onto THREE rows, and its rows were
 * 46px and then 44px tall, because a wrapping flex row stretches to its tallest
 * item and the first row held a bordered group. Four export buttons were what made
 * it wrap that far.
 *
 * jsdom cannot measure any of that — it has no layout. What it CAN hold is the two
 * declarations that caused it, and those are what regress: a `border` creeping back
 * onto the group, or a fifth export button being added beside the menu instead of
 * inside it.
 * ==============================================================================
 */
describe('the roster toolbar: one row height, and one export control', () => {
    it('offers a single Export trigger, not one button per file extension', () => {
        render(<RosterView user={VISITOR} />);

        expect(screen.getByRole('button', { name: /^Export$/i })).toBeTruthy();
        // The four that used to sit in the toolbar are inside the menu now. A new
        // format added as a toolbar button rather than a menu item turns this red.
        for (const gone of [/^CSV$/i, /^ICS$/i, /^Excel$/i, /^PDF$/i]) {
            expect(screen.queryByRole('button', { name: gone })).toBeNull();
        }
    });

    it('gives the view switcher a RING, never a border, so it cannot out-grow the row', () => {
        render(<RosterView user={VISITOR} />);

        const group = screen.getByRole('group', { name: /how to show the roster/i });
        // A border is laid out and adds 2px to the group's height; a ring is only
        // painted. That 2px was the whole of the "boxes of different size".
        expect(group.className).toContain('ring-1');
        expect(group.className).toContain('ring-inset');
        expect(group.className).not.toMatch(/(^|\s)border(\s|$)/);
    });

    it('declares the same 44px floor on every control in the bar', () => {
        render(<RosterView user={VISITOR} />);

        const group = screen.getByRole('group', { name: /how to show the roster/i });
        const bar = group.parentElement;
        for (const child of Array.from(bar.children)) {
            // The group carries its floor on its buttons; everything else on itself.
            const declares = (el) => el.className.includes('min-h-11')
                || Array.from(el.querySelectorAll('button')).some((b) => b.className.includes('min-h-11'));
            expect(declares(child)).toBe(true);
        }
    });

    /**
     * ⚠️ `contrast.test.js` PROVES THE HEXES PASS AA. It cannot prove the button
     *    uses them — that reach is exactly where a colour change goes wrong
     *    silently. These read the classes the component actually renders.
     */
    it('marks the selected half with the soft indigo tint, not a heavy dark fill', () => {
        render(<RosterView user={VISITOR} />);

        const group = screen.getByRole('group', { name: /how to show the roster/i });
        const [department, myWeek] = Array.from(group.children);
        expect(department.getAttribute('aria-pressed')).toBe('true');

        expect(department.className).toContain('bg-indigo-100');
        expect(department.className).toContain('text-indigo-700');
        expect(department.className).toContain('dark:bg-indigo-900/40');
        // The dark block the owner read as a different control is gone for good.
        expect(department.className).not.toContain('bg-slate-700');
        expect(department.className).not.toContain('text-white');

        // The two halves are otherwise the SAME component — same padding, shape and
        // type. Only the state classes differ.
        const structural = (el) => el.className.split(/\s+/)
            .filter((c) => !/indigo|slate|white|ring/.test(c)).sort().join(' ');
        expect(structural(department)).toBe(structural(myWeek));
    });

    it('does not let colour alone say which half is selected', () => {
        // The tint separates the halves by HUE, barely at all by lightness: 1.23:1
        // on the fill and 1.04:1 on the text (measured in `contrast.test.js`).
        // Greyscale — a washed-out screen, or a colour vision deficiency — would
        // leave them identical. The ring is the cue that survives that.
        render(<RosterView user={VISITOR} />);

        const group = screen.getByRole('group', { name: /how to show the roster/i });
        const [department, myWeek] = Array.from(group.children);
        expect(department.className).toContain('ring-2');
        expect(department.className).toContain('ring-indigo-600');
        expect(department.className).toContain('ring-inset');   // costs no height
        expect(myWeek.className).not.toContain('ring-2');
    });

    it('gives Configure a dark variant, so it is not a white block in dark mode', () => {
        render(<RosterView user={VISITOR} />);

        const configure = screen.getByRole('button', { name: /configure/i });
        expect(configure.className).toContain('dark:bg-slate-800');
        expect(configure.className).toContain('dark:text-slate-300');
    });

    it('is a two-column grid on a phone and a flex row from `sm:` up', () => {
        // ⚠️ A GRID, AND THE REASON IS MEASURED. Two flex items with `flex: 1 1 0`
        //    should split their line evenly; at 375px they came out 183px and 151px
        //    and `min-w-0` did not move them. Two `1fr` columns are equal by
        //    definition, so Configure and Export cannot drift apart again.
        render(<RosterView user={VISITOR} />);

        const bar = screen.getByRole('group', { name: /how to show the roster/i }).parentElement;
        expect(mobileClasses(bar)).toContain('grid');
        expect(mobileClasses(bar)).toContain('grid-cols-2');
        // ...and the desktop row is untouched.
        expect(bar.className).toContain('sm:flex');
        expect(bar.className).toContain('sm:justify-end');
    });

    it('spans the switcher across both columns, leaving one each for Configure and Export', () => {
        render(<RosterView user={VISITOR} />);

        const group = screen.getByRole('group', { name: /how to show the roster/i });
        expect(mobileClasses(group)).toContain('col-span-2');
        expect(group.className).toContain('sm:col-auto');

        // Neither of the two controls beneath declares a width of its own — the
        // grid column decides, which is what makes them identical.
        const bar = group.parentElement;
        const [, configure, exportCell] = Array.from(bar.children);
        for (const cell of [configure, exportCell]) {
            expect(mobileClasses(cell)).not.toContain('flex-1');
            expect(mobileClasses(cell)).not.toContain('w-full');
        }
    });
});

/**
 * "MY WEEK": ONE ROW RHYTHM, NOT ONE PER DUTY NAME.
 *
 * Measured at 375px: 68px, 69px and 73px for rows that are the same kind of thing.
 * Two causes, both declarations. `items-baseline` puts a padded badge, a 16px duty
 * name and a 14px date on one baseline, and each combination resolves to a
 * different line box. And the date shared a line with the duty, so a long duty name
 * wrapped where a short one did not — the row height depended on what the clinic
 * was called.
 */
describe('the my-week list: every row the same height on a phone', () => {
    /**
     * ⚠️ A ROSTER MUST BE GENERATED FIRST, and this is not a detail.
     *
     * Without one the panel renders an explanatory paragraph and NO list, so the
     * two assertions below iterated an empty collection and the tests passed while
     * checking nothing at all. They were written that way, caught by asserting the
     * list exists, and are only meaningful because of these six lines.
     */
    const openMyWeek = () => {
        render(<RosterView user={VISITOR} />);
        openConfigure();
        fireEvent.change(screen.getByLabelText('Staff row 1 name'), { target: { value: 'Peter Parker' } });
        fireEvent.click(screen.getAllByRole('button', { name: /add row/i })[0]);
        fireEvent.change(screen.getByLabelText('Staff row 2 name'), { target: { value: 'Carol Danvers' } });
        fireEvent.change(screen.getByLabelText('Task row 1 name'), { target: { value: 'Ward Round' } });
        fireEvent.click(screen.getByRole('button', { name: /^draft roster$/i }));
        fireEvent.click(screen.getByRole('button', { name: /my week/i }));
        return document.querySelector('[data-roster-view="person"]');
    };

    it('centres the row rather than sitting it on a shared baseline', () => {
        const panel = openMyWeek();
        const list = panel.querySelector('ul');
        expect(list).toBeTruthy();
        expect(list.children.length).toBeGreaterThan(0);
        for (const row of Array.from(list.children)) {
            expect(row.className).toContain('items-center');
            expect(row.className).not.toContain('items-baseline');
        }
    });

    it('gives the date its own line on a phone, so the break cannot depend on the duty name', () => {
        const panel = openMyWeek();
        const list = panel.querySelector('ul');
        expect(list).toBeTruthy();
        expect(list.children.length).toBeGreaterThan(0);
        for (const row of Array.from(list.children)) {
            const date = row.firstElementChild;
            expect(mobileClasses(date)).toContain('w-full');
            expect(date.className).toContain('sm:w-auto');
            // The 9rem column is what lines the dates up on a DESKTOP, and it must
            // stay gated: unconditional, it would reserve 144px of a 375px screen.
            expect(date.className).toContain('sm:min-w-[9rem]');
            expect(date.className).not.toMatch(/(^|\s)min-w-\[9rem\]/);
        }
    });
});
