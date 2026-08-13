/**
 * THE BAND RULER'S SAFETY PROPERTY, PROVED BY EXHAUSTION RATHER THAN BY EXAMPLE.
 *
 * The ruler is the only control in the wizard that silently corrects its input —
 * it clamps a drag instead of refusing it, because a pointer position is not a
 * number somebody typed and can re-read. That clamp is therefore the single thing
 * standing between a drag and a `rules.bands` object that is not a partition of
 * the grade scale, which the engine would refuse and which would block Generate.
 *
 * Example-based tests pin the cases somebody thought of. This walks ALL of them:
 * every legal partition of AH7–AH17 into the scale's bands (120 of them today),
 * crossed with every divider, crossed with every requested grade from well below
 * the scale to well above it — 10,800 moves — and asserts after each that the
 * result is still a contiguous, gapless, non-empty partition reaching AH17.
 *
 * WHY IT EXISTS: adding the fourth band (non-exempt AH7–AH10, split out of
 * junior) broke 121 tests that had the three-band cut written into them, and the
 * repair leaned on reasoning about the arithmetic — "a divider cannot cross its
 * neighbour because the floor is one above the divider below". That reasoning was
 * right, but it was reasoning. This measures it, and because every bound is
 * derived from `BAND_NAMES` rather than written down, it measures it again for
 * free the day a fifth band arrives.
 */
import { describe, it, expect } from 'vitest';
import {
    BAND_NAMES, RULER_GRADES, BAND_DIVIDERS, bandsToInputs,
    bandRulerModel, moveBandDivider, bandDividerAtFraction,
} from './rosterWizard.js';

const MIN = RULER_GRADES[0];
const MAX = RULER_GRADES[RULER_GRADES.length - 1];
const N = BAND_NAMES.length;

const allPartitions = () => {
    const out = [];
    const walk = (start, depth, acc) => {
        if (depth === N - 1) { out.push([...acc, [start, MAX]]); return; }
        for (let end = start; end <= MAX - (N - depth - 1); end += 1) walk(end + 1, depth + 1, [...acc, [start, end]]);
    };
    walk(MIN, 0, []);
    return out.map((s) => Object.fromEntries(BAND_NAMES.map((n, i) => [n, s[i]])));
};

// Assert against `segments` — moveBandDivider's real return shape.
const assertSegments = (segments, why) => {
    expect(segments.length, `${why}: wrong band count`).toBe(N);
    let cursor = MIN;
    segments.forEach((seg, i) => {
        expect(seg.band, `${why}: band ${i} out of order`).toBe(BAND_NAMES[i]);
        expect(seg.min, `${why}: ${seg.band} starts ${seg.min}, expected ${cursor}`).toBe(cursor);
        expect(seg.max >= seg.min, `${why}: ${seg.band} EMPTY (${seg.min}..${seg.max})`).toBe(true);
        cursor = seg.max + 1;
    });
    expect(cursor - 1, `${why}: stops at AH${cursor - 1}, not AH${MAX}`).toBe(MAX);
};

describe('the band ruler can never be driven out of a legal partition', () => {
    const partitions = allPartitions();

    it(`enumerates every legal ${N}-band partition of AH${MIN}–AH${MAX}`, () => {
        expect(partitions.length).toBe(120);          // C(10,3) for 4 bands over 11 grades
        expect(BAND_DIVIDERS.length).toBe(N - 1);
    });

    it('survives EVERY divider move from EVERY legal partition, in range and far out', () => {
        let moves = 0;
        for (const bands of partitions) {
            const inputs = bandsToInputs(bands);
            for (let index = 0; index < N - 1; index += 1) {
                for (let requested = MIN - 8; requested <= MAX + 11; requested += 1) {
                    const r = moveBandDivider(inputs, index, requested);
                    moves += 1;
                    expect(r.ok, `d${index}->${requested} refused from ${JSON.stringify(bands)}`).toBe(true);
                    assertSegments(r.segments, `move d${index}->${requested} from ${JSON.stringify(bands)}`);
                    // the clamp landed inside the published travel, and nowhere else moved
                    const { min, max } = bandRulerModel(inputs).limits[index];
                    expect(r.value >= min && r.value <= max, `d${index}->${requested} escaped [${min},${max}] as ${r.value}`).toBe(true);
                    r.dividers.forEach((d, i) => {
                        if (i !== index) expect(d, `d${index}->${requested} disturbed d${i}`).toBe(bandRulerModel(inputs).dividers[i]);
                    });
                }
            }
        }
        expect(moves).toBe(120 * 3 * 30);
    });

    it('publishes strictly increasing dividers and never an inverted limit', () => {
        for (const bands of partitions) {
            const model = bandRulerModel(bandsToInputs(bands));
            expect(model.representsInputs, `legal partition reported dishonest: ${JSON.stringify(bands)}`).toBe(true);
            for (let i = 1; i < model.dividers.length; i += 1) {
                expect(model.dividers[i] > model.dividers[i - 1], `not increasing: ${model.dividers}`).toBe(true);
            }
            model.limits.forEach(({ min, max }, i) => {
                expect(min <= max, `limits inverted at d${i} of ${model.dividers}: ${min}>${max}`).toBe(true);
                for (const target of [min, max]) {
                    assertSegments(moveBandDivider(bandsToInputs(bands), i, target).segments, `clamp d${i}->${target}`);
                }
            });
        }
    });

    it('turns every pointer fraction into a drag the clamp can make legal', () => {
        // bandDividerAtFraction is DELIBERATELY unclamped — moveBandDivider owns the
        // clamp. So the contract is: whatever it returns, feeding it in stays legal.
        const seen = new Set();
        for (let f = -0.5; f <= 1.5; f += 0.005) {
            const g = bandDividerAtFraction(f);
            expect(Number.isInteger(g), `fraction ${f.toFixed(3)} -> ${g}`).toBe(true);
            seen.add(g);
            for (let i = 0; i < N - 1; i += 1) {
                assertSegments(moveBandDivider(bandsToInputs(partitions[0]), i, g).segments, `drag d${i}->${g}`);
                assertSegments(moveBandDivider(bandsToInputs(partitions[119]), i, g).segments, `drag d${i}->${g}`);
            }
        }
        // and it spans the whole scale, so no part of the ruler is undraggable
        expect(Math.min(...seen)).toBe(MIN - 1);
        expect(Math.max(...seen)).toBe(MAX);
    });

    it('draws a legal partition from input that is NOT one, and admits it', () => {
        // THE CEILING'S ONLY JOB. From a legal partition every divider is already
        // inside its travel, so the clamp never binds and a loosened ceiling is
        // invisible — a mutation removing it survived the sweep above. The ceiling
        // exists for the OTHER path: `bandRulerModel` promises to draw the nearest
        // legal partition from anything at all (a half-typed cell, bands pasted
        // from another config, a band list that overlaps), and to set
        // `representsInputs: false` so the component can say so on screen rather
        // than quietly rewriting what the user chose.
        const garbage = [
            {},
            null,
            undefined,
            // every band demanding the whole scale at once
            Object.fromEntries(BAND_NAMES.map((b) => [b, { min: '7', max: '17' }])),
            // every band demanding AH17 alone — pushes every divider into the ceiling
            Object.fromEntries(BAND_NAMES.map((b) => [b, { min: '17', max: '17' }])),
            // every band off the bottom — pushes every divider into the floor
            Object.fromEntries(BAND_NAMES.map((b) => [b, { min: '-4', max: '-2' }])),
            // blanks, junk and inversions, one per band in turn
            ...BAND_NAMES.flatMap((band) => [
                { ...bandsToInputs(), [band]: { min: '', max: '' } },
                { ...bandsToInputs(), [band]: { min: 'AH nine', max: '??' } },
                { ...bandsToInputs(), [band]: { min: '17', max: '7' } },
                { ...bandsToInputs(), [band]: { min: '99', max: '120' } },
            ]),
        ];

        for (const inputs of garbage) {
            const model = bandRulerModel(inputs);
            const why = `garbage input ${JSON.stringify(inputs)}`;
            // It still draws something a human can read and the engine would accept…
            assertSegments(model.segments, why);
            for (let i = 1; i < model.dividers.length; i += 1) {
                expect(model.dividers[i] > model.dividers[i - 1], `${why}: dividers not increasing: ${model.dividers}`).toBe(true);
            }
            model.limits.forEach(({ min, max }, i) => {
                expect(min <= max, `${why}: limits inverted at d${i}`).toBe(true);
            });
            // …and every divider is still movable from there without escaping legality.
            for (let i = 0; i < N - 1; i += 1) {
                for (const target of [MIN - 3, MIN, model.dividers[i], MAX, MAX + 3]) {
                    const r = moveBandDivider(inputs, i, target);
                    expect(r.ok, `${why}: move d${i}->${target} refused`).toBe(true);
                    assertSegments(r.segments, `${why}: move d${i}->${target}`);
                }
            }
        }

        // The honesty flag is not stuck on: it is false for the ones that were not a
        // partition, and true for the shipped cut.
        expect(bandRulerModel({}).representsInputs).toBe(false);
        expect(bandRulerModel(bandsToInputs()).representsInputs).toBe(true);
    });
});
