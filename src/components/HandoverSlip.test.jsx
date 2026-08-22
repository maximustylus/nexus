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

afterEach(cleanup);

const base = {
    score: 3, riskTier: 'Amber', postalSector: '73',
    sessionId: 'NX-ABC123XYZ', formattedDate: '22/08/2026',
    data: { pavsScore: 100 },
};
const slip = (over = {}) => render(<HandoverSlip {...base} {...over} />);

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
            expect(slip({ data: { healthierSgEnrolled: value } }).container.textContent)
                .not.toMatch(/Not enrolled with a Healthier SG GP/);
            cleanup();
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
