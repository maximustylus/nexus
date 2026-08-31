/**
 * ==============================================================================
 * HANDOVER SLIP — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * A one-page printable output for somebody who leaves without a phone. The tests
 * that matter here are not about layout — they are about what the page CLAIMS,
 * because a document with a reference number and a risk band on it is read as a
 * referral, and NEXUS is anonymous and cannot back one.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import HandoverSlip from './HandoverSlip';
import { SLIP_FLAG_LINES, SLIP_FLAG_IDS, slipFlagLine } from '../data/slipFlagLines';

afterEach(cleanup);

const base = {
    score: 3, riskTier: 'Amber', postalSector: '73',
    sessionId: 'NX-ABC123XYZ', formattedDate: '22/08/2026',
    data: { pavsScore: 100 },
};
/**
 * ⚠️ `container` IS `document.body`, NOT RTL's WRAPPER DIV. The slip is portalled
 *    to `document.body` (see the note in `HandoverSlip.jsx` — it is what lets the
 *    print stylesheet hide the page with `display: none` without hiding the slip
 *    too), so RTL's own container is empty and every `container.textContent`
 *    assertion below would silently pass against an empty string.
 */
const slip = (over = {}) => {
    render(<HandoverSlip {...base} {...over} />);
    return { container: document.body };
};

describe('⚠️ it must not read as a referral', () => {
    /**
     * THE LOAD-BEARING TEST. NEXUS holds no name, no contact and no retrievable
     * record. A centre receiving this cannot verify it, cannot look anything up,
     * and has not been told the person is coming. If the slip does not say so, it
     * misleads two people at once: the resident, who believes they are expected,
     * and the centre, which believes somebody clinical has assessed them.
     */
    it('says it is not a referral, in those words', () => {
        slip();
        expect(screen.getAllByText(/This is not a referral/i).length).toBeGreaterThan(0);
    });

    it('says the person completed it themselves and nobody clinical reviewed it', () => {
        const { container } = slip();
        expect(container.textContent).toMatch(/completed this screening\s+themselves/i);
        expect(container.textContent).toMatch(/Nobody clinical has reviewed it/i);
    });

    it('says no record can be looked up', () => {
        expect(slip().container.textContent).toMatch(/no record that can be looked up/i);
    });

    it('repeats it at the foot, where a reader who skimmed the top will land', () => {
        const { container } = slip();
        const text = container.textContent;
        expect(text.lastIndexOf('Not a referral')).toBeGreaterThan(text.indexOf('This is not a referral'));
    });

    it('carries the medical disclaimer', () => {
        expect(slip().container.textContent).toMatch(/does not constitute a\s+diagnosis/i);
    });

    it('states the retention period', () => {
        expect(slip().container.textContent).toMatch(/deleted after 24 months/i);
    });
});

describe('what it reports', () => {
    it('names the place rather than printing a bare sector number', () => {
        expect(slip().container.textContent).toMatch(/Woodlands/);
        expect(slip().container.textContent).toMatch(/District 25/);
    });

    it('says "Not provided" when there is no location, rather than inventing one', () => {
        expect(slip({ postalSector: null }).container.textContent).toMatch(/Not provided/);
    });

    it('reports the weekly figure and whether it meets the guideline', () => {
        expect(slip().container.textContent).toMatch(/100 minutes per week/);
        expect(slip().container.textContent).toMatch(/below the 150 min\/week guideline/);
    });

    it('does not claim a shortfall when the figure meets the guideline', () => {
        expect(slip({ data: { pavsScore: 200 } }).container.textContent)
            .not.toMatch(/below the 150/);
    });

    /**
     * The band is an internal weighting, not a clinical grade, and a printed page
     * is exactly where it would be mistaken for one.
     */
    it('marks the band as internal, not a diagnosis', () => {
        expect(slip().container.textContent).toMatch(/an internal banding, not a diagnosis/i);
    });

    it('lists only the flags that were actually reported', () => {
        const { container } = slip({ data: { pavsScore: 100, fallsRisk: true, fearOfFalling: true } });
        expect(container.textContent).toMatch(/now avoiding some activities/i);
        expect(container.textContent).not.toMatch(/Food insecurity/i);
    });

    it('says so plainly when nothing was flagged', () => {
        expect(slip({ data: { pavsScore: 300 } }).container.textContent).toMatch(/Nothing flagged/);
    });

    /**
     * `healthierSgEnrolled` is `null` for "not sure" AND for "not asked". Neither
     * may be printed as "not enrolled" on a page a centre will read.
     */
    it('reports Healthier SG only when the person actually said no', () => {
        expect(slip({ data: { healthierSgEnrolled: false } }).container.textContent)
            .toMatch(/Not enrolled with a Healthier SG GP/);
        [null, undefined, true].forEach((value) => {
            // ⚠️ BEFORE the render, not after. `container` is `document.body`, so a
            //    slip left mounted from the previous case is still in it and a
            //    negative assertion would read the wrong one.
            cleanup();
            expect(slip({ data: { healthierSgEnrolled: value } }).container.textContent)
                .not.toMatch(/Not enrolled with a Healthier SG GP/);
        });
    });
});

describe('the services it prints', () => {
    it('prints full URLs, because on paper a link must be typeable', () => {
        expect(slip().container.textContent).toMatch(/https:\/\//);
    });

    it('works for a sector anywhere in Singapore, not just the north', () => {
        ['64', '46', '82', '01'].forEach((postalSector) => {
            const { container } = slip({ postalSector });
            expect(container.textContent).toMatch(/https:\/\//);
            cleanup();
        });
    });

    it('still lists services when the location is unknown', () => {
        expect(slip({ postalSector: null }).container.textContent).toMatch(/https:\/\//);
    });
});

describe('robustness', () => {
    it('renders with no data at all rather than throwing', () => {
        expect(() => render(<HandoverSlip />)).not.toThrow();
    });

    it('is hidden from assistive tech on screen — it is a print artefact', () => {
        const { container } = slip();
        expect(container.querySelector('.handover-slip').getAttribute('aria-hidden')).toBe('true');
    });
});


// ── THE REPORTED FLAGS, IN TWO LANGUAGES ────────────────────────────────────
//
// `CD10` group 4, the ten reported-flag lines. The slip is the ONE bilingual
// surface in the portal, and the reason is that it is the one output that leaves
// with the person and is handed to somebody else: `TRANSLATION-BRIEF.md` notes
// that "the reader may be a staff member rather than the resident".
//
//   · Translated only  → handed across a counter where the working language is
//                        English, and the receiving service cannot read it.
//   · English only     → the person cannot read an assertion being made about
//                        them to a stranger, so cannot check it, correct it or
//                        decline to hand it over.
//
// Both, English first. These tests hold that shape in place, because the obvious
// "improvement" in either direction breaks one of the two readers.

const ALL_FLAGS = {
    symptomFlag: true,
    medFlag: true,
    fallsRisk: true,
    caregiverStrain: true,
    sdohPsychological: true,
    sdohSocial: true,
    sdohFinancial: true,
    sdohFoodInsecure: true,
    healthierSgEnrolled: false,
    pavsScore: 100,
};

describe('the reported flags print in English and the person\'s language', () => {
    it('prints English alone when the person chose English', () => {
        const { container } = slip({ data: ALL_FLAGS, language: 'en' });
        expect(container.textContent).toContain(SLIP_FLAG_LINES.symptoms.en);
        // Nothing from another language leaks in, and English is not duplicated.
        expect(container.querySelectorAll('.slip-flag-alt')).toHaveLength(0);
    });

    it.each(['ms', 'zh', 'ta'])('prints English AND %s together', (language) => {
        const { container } = slip({ data: ALL_FLAGS, language });
        const text = container.textContent;

        // Nine lines: fallsRisk renders one of two mutually exclusive falls lines.
        expect(container.querySelectorAll('.slip-flag-alt')).toHaveLength(9);

        [
            'symptoms', 'condition', 'falls', 'caregiver', 'psychological',
            'social', 'financial', 'food', 'notEnrolledHsg',
        ].forEach((id) => {
            expect(text, `${id} English missing`).toContain(SLIP_FLAG_LINES[id].en);
            expect(text, `${id} ${language} missing`).toContain(SLIP_FLAG_LINES[id][language]);
        });
    });

    /**
     * ⚠️ ENGLISH LEADS, AND THE ORDER IS THE POINT rather than a style choice.
     *    The counter staff who act on this sheet read English; a page whose first
     *    line of every entry is a script they do not read is a page they will put
     *    down. The person's line is second and set apart, not first.
     */
    it.each(['ms', 'zh', 'ta'])('%s: English comes first within each line', (language) => {
        const { container } = slip({ data: ALL_FLAGS, language });
        const first = container.querySelector('.slip-list li');
        const alt = first.querySelector('.slip-flag-alt');

        expect(first.textContent.startsWith(SLIP_FLAG_LINES.symptoms.en)).toBe(true);
        expect(alt.textContent).toBe(SLIP_FLAG_LINES.symptoms[language]);
    });

    /**
     * Fear of falling is a separate line, not a suffix — a different clinical
     * signal and a different intervention. The two are mutually exclusive, so a
     * reader must never see both.
     */
    /**
     * ⚠️ ASSERTED ON THE RENDERED LINE, NOT WITH `not.toContain`. The first draft
     *    of this test checked that the plain falls sentence was absent — and it
     *    can never be, in any language: "Fall in the past 12 months, and now
     *    avoiding some activities" CONTAINS "Fall in the past 12 months" as a
     *    prefix. A substring assertion here fails on correct output and would
     *    have been "fixed" by weakening it. The real property is that exactly one
     *    falls line is rendered and it is the right one.
     */
    it.each(['en', 'ms', 'zh', 'ta'])('%s: avoiding-activities replaces the plain falls line', (language) => {
        const { container } = slip({
            data: { ...ALL_FLAGS, fallsRisk: true, fearOfFalling: true }, language,
        });
        const lines = [...container.querySelectorAll('.slip-list li')]
            .filter((li) => li.textContent.includes(SLIP_FLAG_LINES.falls.en));

        expect(lines).toHaveLength(1);
        const expected = language === 'en'
            ? SLIP_FLAG_LINES.fallsAvoiding.en
            : SLIP_FLAG_LINES.fallsAvoiding.en + SLIP_FLAG_LINES.fallsAvoiding[language];
        expect(lines[0].textContent).toBe(expected);
    });

    it.each(['en', 'ms', 'zh', 'ta'])('%s: the plain falls line is used when there is no fear of falling', (language) => {
        const { container } = slip({
            data: { ...ALL_FLAGS, fallsRisk: true, fearOfFalling: false }, language,
        });
        const lines = [...container.querySelectorAll('.slip-list li')]
            .filter((li) => li.textContent.includes(SLIP_FLAG_LINES.falls.en));

        expect(lines).toHaveLength(1);
        const expected = language === 'en'
            ? SLIP_FLAG_LINES.falls.en
            : SLIP_FLAG_LINES.falls.en + SLIP_FLAG_LINES.falls[language];
        expect(lines[0].textContent).toBe(expected);
    });

    /**
     * ⚠️ AN UNKNOWN OR MISSING LANGUAGE FALLS BACK TO ENGLISH-ONLY, NEVER TO A
     *    BLANK SECOND LINE. This page is carried to a service; a gap where a
     *    sentence should be reads as a broken system, and the English above it
     *    already carries the whole meaning.
     */
    it('falls back to English alone for a language it does not have', () => {
        const { container } = slip({ data: ALL_FLAGS, language: 'fr' });
        expect(container.textContent).toContain(SLIP_FLAG_LINES.symptoms.en);
        expect(container.querySelectorAll('.slip-flag-alt')).toHaveLength(0);
    });

    it('defaults to English when no language is passed at all', () => {
        const { container } = slip({ data: ALL_FLAGS });
        expect(container.textContent).toContain(SLIP_FLAG_LINES.food.en);
        expect(container.querySelectorAll('.slip-flag-alt')).toHaveLength(0);
    });

    it('still says "Nothing flagged" when there is nothing to report', () => {
        expect(slip({ data: { pavsScore: 200 }, language: 'ta' }).container.textContent)
            .toContain('Nothing flagged');
    });
});

describe('the flag-line table is complete', () => {
    /**
     * A line present in English and missing in one language would print a lone
     * English entry among nine bilingual ones — which reads as a rendering fault
     * on a page somebody is handing to a stranger.
     */
    it.each(SLIP_FLAG_IDS)('%s has all four languages, non-empty', (id) => {
        ['en', 'ms', 'zh', 'ta'].forEach((language) => {
            const value = SLIP_FLAG_LINES[id][language];
            expect(typeof value, `${id}.${language}`).toBe('string');
            expect(value.trim(), `${id}.${language}`).not.toBe('');
        });
    });

    it('returns null for an id that does not exist, rather than a blank line', () => {
        expect(slipFlagLine('notAFlag', 'ms')).toBeNull();
    });

    /**
     * ⚠️ IDS, NOT SENTENCES. The flag list used to be English strings rendered
     *    with `key={f}` — content, identity and React key all at once, with
     *    nowhere for a translation to attach. This asserts the ids the component
     *    emits still exist in the table; a rename in one place and not the other
     *    drops a line from the slip silently.
     */
    it('covers every id the slip can emit', () => {
        [
            'symptoms', 'condition', 'falls', 'fallsAvoiding', 'caregiver',
            'psychological', 'social', 'financial', 'food', 'notEnrolledHsg',
        ].forEach((id) => expect(SLIP_FLAG_IDS).toContain(id));
    });
});
