/**
 * ==============================================================================
 * AURA ROSTER ENGINE — P1 SAFETY GUARD SUITE
 * ==============================================================================
 * Runner: Vitest
 * Run:    npm test
 *
 * PURPOSE — these are SPECIFICATION tests, unlike the characterization suite in
 * `auraEngine.test.js`. They pin the guards added by ROSTER_TODO.md P1:
 *
 *   1.2  `weeks` is validated (ROSTER_QC_AUDIT.md M3)
 *   1.3  an empty generated roster is never written
 *   1.4  leaving demo mode restores the live staff pool (M1)
 *   1.5  the confirmation modal states the real range about to be written
 *
 * They are deliberately pure: RosterView keeps only the wiring, so none of this
 * needs a mounted component or a mocked Firestore.
 *
 * NOTE ON SCOPE — [updated: ROSTER_TODO.md P4 has landed]. This suite still does
 * not own date CORRECTNESS; the weekday and DST assertions live in
 * `auraEngine.test.js`. What it owns is the guarantee that the range DESCRIBED
 * to the user is the range that gets WRITTEN. That property is unchanged by P4,
 * but two of its pins moved by one day because `generateRoster` now snaps its
 * start to the Monday of the requested week, and `describeGenerationRange`
 * reads the real keys back. The pin formerly named
 * `describes today's UNSNAPPED start date` is now
 * `reports the SNAPPED start date` — inverted deliberately, per P4.2, exactly as
 * its own comment instructed.
 * ==============================================================================
 */

import { describe, it, expect, vi } from 'vitest';
import {
    generateRoster,
    validateRosterConfig,
    prepareRosterWrite,
    describeGenerationRange,
    formatRosterDateKey,
    restoreLiveRosterConfig,
    LIVE_ROSTER_DEFAULTS,
    MAX_ROSTER_WEEKS,
} from './auraEngine';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** The config RosterView ships in live mode. */
const liveConfig = (overrides = {}) => ({
    staff: ['Brandon', 'Ying Xian', 'Derlinder', 'Fadzlynn'],
    tasks: ['EFT', 'IPT+SKG', 'NC', 'FSG+WI'],
    startDate: '2026-02-01',
    weeks: 4,
    ...overrides,
});

/** What the demo effect turns `config` into (src/data/mockData.js). */
const demoPoisonedConfig = (overrides = {}) => ({
    ...liveConfig(),
    staff: ['Steve', 'Peter', 'Charles', 'Jean', 'Tony'],
    tasks: ['Avenger Protocol', 'Web Slinger Audit', 'Cerebro Scan', 'Shield Patrol'],
    ...overrides,
});

/**
 * Every `weeks` value that must be refused.
 *
 * `NaN` is the M3 value itself — it is what `parseInt('')` returned from the
 * onChange handler at the old RosterView.jsx:356. `''` is what the handler
 * stores now for an empty field, so it has to be refused too.
 */
const REJECTED_WEEKS = [
    ['NaN (the M3 value: parseInt(""))', NaN],
    ['empty string (field cleared)', ''],
    ['zero', 0],
    ['negative', -1],
    ['large negative', -52],
    ['non-integer', 1.5],
    ['non-integer just over 1', 1.0001],
    ['one above the ceiling', MAX_ROSTER_WEEKS + 1],
    ['absurdly large', 100000],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
    ['null', null],
    ['undefined', undefined],
    ['numeric string', '4'],
    ['whitespace string', ' '],
    ['boolean', true],
    ['object', {}],
    ['array', [4]],
];

// ─── 1.2 — weeks validation ──────────────────────────────────────────────────
describe('validateRosterConfig — weeks (ROSTER_QC_AUDIT.md M3)', () => {
    it('has a ceiling of 52 weeks — one calendar year per roster document', () => {
        expect(MAX_ROSTER_WEEKS).toBe(52);
    });

    REJECTED_WEEKS.forEach(([label, weeks]) => {
        it(`rejects weeks = ${label}`, () => {
            const result = validateRosterConfig(liveConfig({ weeks }));

            expect(result.valid).toBe(false);
            // The reason is shown to the user verbatim, so it must be a real sentence.
            expect(typeof result.reason).toBe('string');
            expect(result.reason.length).toBeGreaterThan(0);
        });
    });

    [1, 2, 4, 13, 26, MAX_ROSTER_WEEKS].forEach((weeks) => {
        it(`accepts weeks = ${weeks}`, () => {
            expect(validateRosterConfig(liveConfig({ weeks }))).toEqual({
                valid: true,
                reason: null,
            });
        });
    });
});

// ─── 1.2 — the rest of the config ────────────────────────────────────────────
describe('validateRosterConfig — start date', () => {
    ['', ' ', 'tomorrow', '2026-2-1', '01/02/2026', '2026-02-30', '2026-13-01', null, undefined, 20260201]
        .forEach((startDate) => {
            it(`rejects startDate = ${JSON.stringify(startDate)}`, () => {
                const result = validateRosterConfig(liveConfig({ startDate }));
                expect(result.valid).toBe(false);
                expect(result.reason).toMatch(/start date/i);
            });
        });

    ['2026-02-01', '2026-12-31', '2026-02-28', '2028-02-29'].forEach((startDate) => {
        it(`accepts startDate = ${startDate}`, () => {
            expect(validateRosterConfig(liveConfig({ startDate })).valid).toBe(true);
        });
    });
});

describe('validateRosterConfig — staff pool and task list', () => {
    [[], [''], ['  '], null, undefined, 'Brandon'].forEach((staff) => {
        it(`rejects staff = ${JSON.stringify(staff)}`, () => {
            const result = validateRosterConfig(liveConfig({ staff }));
            expect(result.valid).toBe(false);
            expect(result.reason).toMatch(/staff/i);
        });
    });

    [[], [''], null, undefined].forEach((tasks) => {
        it(`rejects tasks = ${JSON.stringify(tasks)}`, () => {
            const result = validateRosterConfig(liveConfig({ tasks }));
            expect(result.valid).toBe(false);
            expect(result.reason).toMatch(/task/i);
        });
    });

    it('rejects a missing config object outright', () => {
        expect(validateRosterConfig(undefined).valid).toBe(false);
        expect(validateRosterConfig(null).valid).toBe(false);
    });

    it('considers the DEMO config valid — validation alone cannot stop M1', () => {
        // Important: the Marvel pool is well-formed. Nothing about it is
        // syntactically wrong, which is exactly why M1 needs the demo-exit reset
        // (1.4) and the pool shown in the confirmation modal (1.5). If this ever
        // starts failing, the M1 guard has been re-implemented in the wrong place.
        expect(validateRosterConfig(demoPoisonedConfig()).valid).toBe(true);
    });
});

// ─── 1.2 + 1.3 — nothing invalid or empty can reach the write ────────────────
describe('prepareRosterWrite — the gate in front of setDoc', () => {
    it('returns data for a valid config, matching generateRoster exactly', () => {
        const config = liveConfig();
        const prepared = prepareRosterWrite(config);

        expect(prepared.ok).toBe(true);
        expect(prepared.reason).toBeNull();
        expect(Object.keys(prepared.data).length).toBeGreaterThan(0);
        expect(prepared.data).toEqual(generateRoster(config));
    });

    REJECTED_WEEKS.forEach(([label, weeks]) => {
        it(`refuses to produce write data for weeks = ${label}`, () => {
            const generate = vi.fn(() => ({ '2026-02-01': [{}] }));
            const prepared = prepareRosterWrite(liveConfig({ weeks }), generate);

            expect(prepared.ok).toBe(false);
            expect(prepared.data).toBeNull();
            expect(prepared.reason).toBeTruthy();
            // The generator is never even reached, so no accidental write payload exists.
            expect(generate).not.toHaveBeenCalled();
        });
    });

    it('refuses the write when the generated roster is empty (1.3, defence in depth)', () => {
        // The empty-object case that wiped the live document. 1.2 stops the known
        // cause; this stops every other cause of the same catastrophe.
        const prepared = prepareRosterWrite(liveConfig(), () => ({}));

        expect(prepared.ok).toBe(false);
        expect(prepared.data).toBeNull();
        expect(prepared.reason).toMatch(/empty/i);
        expect(prepared.reason).toMatch(/unchanged/i);
    });

    it('refuses the write when the generator returns nothing at all', () => {
        expect(prepareRosterWrite(liveConfig(), () => null).ok).toBe(false);
        expect(prepareRosterWrite(liveConfig(), () => undefined).ok).toBe(false);
        expect(prepareRosterWrite(liveConfig(), () => []).ok).toBe(false);
    });

    it('never returns ok with an empty payload, for any config it accepts', () => {
        const configs = [
            liveConfig(),
            liveConfig({ weeks: 1 }),
            liveConfig({ weeks: MAX_ROSTER_WEEKS }),
            liveConfig({ startDate: '2026-03-02' }),
            demoPoisonedConfig(),
        ];

        configs.forEach((config) => {
            const prepared = prepareRosterWrite(config);
            expect(prepared.ok).toBe(true);
            expect(Object.keys(prepared.data).length).toBeGreaterThan(0);
        });
    });
});

// ─── 1.5 — the range the modal promises is the range that gets written ───────
describe('describeGenerationRange — the confirmation modal is truthful', () => {
    const rangeFromEngine = (config) => {
        const keys = Object.keys(generateRoster(config)).sort();
        return { firstDate: keys[0], lastDate: keys[keys.length - 1], dayCount: keys.length };
    };

    it('pins the shipped default: 2–28 Feb 2026 across 24 days', () => {
        // P4: was 1–27 Feb before `generateRoster` snapped its Sunday start to
        // Monday 2 Feb. Same 24 days, moved forward one.
        expect(describeGenerationRange(liveConfig())).toEqual({
            firstDate: '2026-02-02',
            lastDate: '2026-02-28',
            dayCount: 24,
        });
    });

    [
        liveConfig({ weeks: 1 }),
        liveConfig({ weeks: 2 }),
        liveConfig({ weeks: 4 }),
        liveConfig({ weeks: 7 }),
        liveConfig({ weeks: MAX_ROSTER_WEEKS }),
        liveConfig({ startDate: '2026-01-01' }),
        liveConfig({ startDate: '2026-03-02', weeks: 4 }),
        liveConfig({ startDate: '2026-12-28', weeks: 3 }),
        demoPoisonedConfig(),
    ].forEach((config) => {
        it(`matches the real generateRoster keys for start ${config.startDate} × ${config.weeks}w × ${config.staff.length} staff`, () => {
            // Asserted against the live function, not a re-derivation: the modal
            // text cannot drift away from what is actually written.
            expect(describeGenerationRange(config)).toEqual(rangeFromEngine(config));
        });
    });

    it('covers every key the write contains, and nothing outside it', () => {
        const config = liveConfig();
        const plan = describeGenerationRange(config);
        const keys = Object.keys(prepareRosterWrite(config).data);

        expect(keys.length).toBe(plan.dayCount);
        keys.forEach((key) => {
            expect(key >= plan.firstDate).toBe(true);
            expect(key <= plan.lastDate).toBe(true);
        });
    });

    it('reports the SNAPPED start date, which is how the user learns about the snap', () => {
        // INVERTED BY ROSTER_TODO.md P4.2 — deliberately. This test used to be
        // named `describes today's UNSNAPPED start date, not the P4 behaviour`
        // and asserted `firstDate === config.startDate` with the label
        // 'Sun 1 Feb 2026'; its own comment named it as the assertion P4 should
        // update.
        //
        // `generateRoster` now snaps 2026-02-01 (Sunday) to Monday 2 February,
        // and it does so WITHOUT changing its return shape — `prepareRosterWrite`
        // still receives a bare roster map. `describeGenerationRange` derives the
        // range from the generated keys, so the confirmation modal shows the
        // Monday before anything is written. That read-back IS the disclosure
        // mechanism: this assertion is what keeps the snap from being silent.
        const plan = describeGenerationRange(liveConfig());

        expect(liveConfig().startDate).toBe('2026-02-01');
        expect(formatRosterDateKey(liveConfig().startDate)).toBe('Sun 1 Feb 2026');

        expect(plan.firstDate).not.toBe(liveConfig().startDate);
        expect(plan.firstDate).toBe('2026-02-02');
        expect(formatRosterDateKey(plan.firstDate)).toBe('Mon 2 Feb 2026');
        expect(formatRosterDateKey(plan.lastDate)).toBe('Sat 28 Feb 2026');
    });

    it('is the identity for a start date that is already a Monday', () => {
        // The complement of the test above: the snap only ever moves a date that
        // is not a Monday, so a roster master who typed a Monday sees exactly
        // what they typed.
        const plan = describeGenerationRange(liveConfig({ startDate: '2026-02-02' }));

        expect(plan.firstDate).toBe('2026-02-02');
        expect(formatRosterDateKey(plan.firstDate)).toBe('Mon 2 Feb 2026');
    });

    REJECTED_WEEKS.forEach(([label, weeks]) => {
        it(`returns null (nothing to promise) for weeks = ${label}`, () => {
            expect(describeGenerationRange(liveConfig({ weeks }))).toBeNull();
        });
    });

    it('returns null rather than throwing on an unusable start date', () => {
        expect(describeGenerationRange(liveConfig({ startDate: '' }))).toBeNull();
        expect(describeGenerationRange(undefined)).toBeNull();
    });
});

describe('formatRosterDateKey', () => {
    it('labels a key with its weekday, day, month and year', () => {
        expect(formatRosterDateKey('2026-02-01')).toBe('Sun 1 Feb 2026');
        expect(formatRosterDateKey('2026-02-28')).toBe('Sat 28 Feb 2026');
        expect(formatRosterDateKey('2026-12-31')).toBe('Thu 31 Dec 2026');
    });

    it('does not throw on a value that is not a date key', () => {
        expect(formatRosterDateKey('')).toBe('');
        expect(formatRosterDateKey(undefined)).toBe('');
        expect(formatRosterDateKey('nonsense')).toBe('nonsense');
    });
});

// ─── 1.4 — leaving demo mode restores the live pool ──────────────────────────
describe('restoreLiveRosterConfig (ROSTER_QC_AUDIT.md M1)', () => {
    it('ships an EMPTY staff pool — AN14 — and the same tasks as ever', () => {
        // This pinned the four names the old RosterView useState hardcoded, as a
        // behaviour-preserving proof. `AN14` ended that: the names shipped in the
        // public bundle, so the default pool is now empty and the team's member
        // list is the only source of people. The pin flips to guarding the
        // ABSENCE — if a name ever returns here, this fails before the bundle
        // check even runs.
        expect(LIVE_ROSTER_DEFAULTS.staff).toEqual([]);
        expect(LIVE_ROSTER_DEFAULTS.tasks).toEqual(['EFT', 'IPT+SKG', 'NC', 'FSG+WI']);
        expect(LIVE_ROSTER_DEFAULTS.startDate).toBe('2026-02-01');
        expect(LIVE_ROSTER_DEFAULTS.weeks).toBe(4);
    });

    it('with no argument returns the initial config — empty pool, live tasks', () => {
        // Was `toEqual(liveConfig())`, the four-name fixture. Post-AN14 the
        // no-argument call is the no-team case, and it names nobody.
        expect(restoreLiveRosterConfig()).toEqual(liveConfig({ staff: [] }));
    });

    it('purges the Marvel staff pool and task list — M1 blast radius, post-AN14', () => {
        const restored = restoreLiveRosterConfig(demoPoisonedConfig());

        // The M1 guarantee, unchanged: not one demo character survives the toggle.
        ['Steve', 'Peter', 'Charles', 'Jean', 'Tony'].forEach((name) => {
            expect(restored.staff).not.toContain(name);
        });
        expect(restored.tasks).not.toContain('Avenger Protocol');

        // What changed with AN14: the pool restores to EMPTY, not to four named
        // colleagues, because the default no longer names anybody. The team's own
        // member list is what refills it (RosterView passes it explicitly).
        expect(restored.staff).toEqual([]);
        expect(restored.tasks).toEqual(['EFT', 'IPT+SKG', 'NC', 'FSG+WI']);
    });

    it('restores the ACTIVE TEAM when one is passed — the live path since v2.0', () => {
        const restored = restoreLiveRosterConfig(demoPoisonedConfig(), {
            staff: ['Casey Tan', 'Rio Lim'],
        });
        expect(restored.staff).toEqual(['Casey Tan', 'Rio Lim']);
        ['Steve', 'Peter'].forEach((name) => expect(restored.staff).not.toContain(name));
    });

    it('refuses to generate from the empty default rather than inventing a roster', () => {
        // This asserted `ok: true` with four real clinicians as leads. Post-AN14
        // the no-team fallback cannot generate: an unsaveable roster (rosterPath
        // throws without a teamId) built from names every visitor downloaded was
        // the trap, and refusal-with-reason is the fix. The full generate path is
        // covered by the team-sourced test above plus RosterView's own suites.
        const prepared = prepareRosterWrite(restoreLiveRosterConfig(demoPoisonedConfig()));
        expect(prepared.ok).toBe(false);
        expect(String(prepared.reason || '')).toMatch(/staff/i);
    });

    it('preserves an in-progress startDate / weeks edit', () => {
        const restored = restoreLiveRosterConfig(
            demoPoisonedConfig({ startDate: '2026-06-01', weeks: 6 }),
        );

        expect(restored.startDate).toBe('2026-06-01');
        expect(restored.weeks).toBe(6);
    });

    it('hands back fresh arrays, so a later edit cannot poison the defaults', () => {
        const first = restoreLiveRosterConfig();
        first.staff.push('Loki');
        first.tasks.push('Chitauri Triage');

        expect(LIVE_ROSTER_DEFAULTS.staff).not.toContain('Loki');
        expect(restoreLiveRosterConfig().staff).not.toContain('Loki');
        expect(restoreLiveRosterConfig().tasks).not.toContain('Chitauri Triage');
    });

    it('is valid the moment a team supplies people, and invalid-with-reason before', () => {
        // Both calls used to be valid because the fallback named four colleagues.
        // Post-AN14 the empty default must NOT validate — a valid config with an
        // empty pool would mean Generate is clickable with nobody to roster —
        // and the refusal must say why in the word the button shows.
        const noTeam = validateRosterConfig(restoreLiveRosterConfig());
        expect(noTeam.valid).toBe(false);
        expect(String(noTeam.reason || '')).toMatch(/staff/i);

        const withTeam = validateRosterConfig(
            restoreLiveRosterConfig(demoPoisonedConfig(), { staff: ['Casey Tan', 'Rio Lim'] }),
        );
        expect(withTeam.valid).toBe(true);
    });
});
