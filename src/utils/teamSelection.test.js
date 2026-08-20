/**
 * ==============================================================================
 * TEAM SELECTION — SPECIFICATION TEST SUITE
 * ==============================================================================
 * Runner: Vitest.  Run: npm test
 *
 * Weighted, like the other seams in this rebuild, towards the refusals — and in
 * particular towards the one property everything else rests on: the active team is
 * always a team the user is actually in.
 */

import { describe, it, expect } from 'vitest';
import {
    NO_TEAM,
    normaliseTeamIds,
    canActOn,
    resolveActiveTeam,
    needsSwitcher,
    teamLabel,
    LAST_TEAM_KEY,
} from './teamSelection';

const A = 'kkh-sport-exercise-medicine';
const B = 'kkh-respiratory-therapy';
const OTHER = 'sgh-physiotherapy';

// B SORTS BEFORE A — 'respiratory' < 'sport'. Named rather than left implicit
// because the first draft of this file assumed the declaration order was the sort
// order and three assertions were wrong in the same way. Anything asserting "the
// default team" should say WHICH by this name, so the reason is on the page.
const FIRST_ALPHABETICALLY = B;

describe('normaliseTeamIds', () => {
    it('drops junk, deduplicates, and trims', () => {
        expect(normaliseTeamIds([B, '', null, B, undefined, `  ${A}  `, 42])).toEqual([B, A]);
    });

    /**
     * Sorted so "the first team" means the same thing on every device and every
     * load. An unsorted default changes when Firestore hands the array back in a
     * different order, which the user experiences as the app forgetting their
     * choice at random.
     */
    it('is deterministically ordered regardless of input order', () => {
        expect(normaliseTeamIds([OTHER, A, B])).toEqual(normaliseTeamIds([B, OTHER, A]));
    });

    it('returns an empty array for anything that is not one', () => {
        [null, undefined, 'kkh-respiratory-therapy', {}, 0].forEach((value) => {
            expect(normaliseTeamIds(value)).toEqual([]);
        });
    });
});

describe('canActOn — the predicate anything that writes must consult', () => {
    it('admits a team the user is in', () => {
        expect(canActOn(A, [A, B])).toBe(true);
        expect(canActOn(`  ${A} `, [A, B])).toBe(true);
    });

    /**
     * THE ASSERTION THIS MODULE EXISTS FOR. A write composed under a team the user
     * does not belong to is the failure the whole rebuild is meant to prevent.
     * `firestore.rules` would deny the read — but relying on that is not a design,
     * and a denied write surfaces as a silent no-op in two of the three listeners.
     */
    it('refuses a team the user is NOT in, however it arrived', () => {
        expect(canActOn(OTHER, [A, B])).toBe(false);
        expect(canActOn('', [A, B])).toBe(false);
        expect(canActOn(null, [A, B])).toBe(false);
        expect(canActOn(A, [])).toBe(false);
        expect(canActOn(A, null)).toBe(false);
        expect(canActOn(A, 'kkh-sport-exercise-medicine')).toBe(false);
    });
});

describe('resolveActiveTeam — precedence', () => {
    it('returns NO_TEAM when the user belongs to nothing', () => {
        expect(resolveActiveTeam({ teamIds: [] })).toBe(NO_TEAM);
        expect(resolveActiveTeam({})).toBe(NO_TEAM);
        expect(resolveActiveTeam({ teamIds: [], stored: A })).toBe(NO_TEAM);
    });

    it('picks the single team without ceremony', () => {
        expect(resolveActiveTeam({ teamIds: [A] })).toBe(A);
    });

    /**
     * A choice already made this session outranks everything. Without this, a
     * membership refresh or an unrelated re-render moves a roster master to a
     * different department mid-edit — and the screen looks plausible either way.
     */
    it('keeps a valid choice already made this session', () => {
        expect(resolveActiveTeam({ teamIds: [A, B], stored: A, previous: B })).toBe(B);
    });

    it('falls back to the remembered choice from last time', () => {
        expect(resolveActiveTeam({ teamIds: [A, B], stored: B })).toBe(B);
    });

    it('falls back to the first team, deterministically', () => {
        expect(resolveActiveTeam({ teamIds: [B, A] })).toBe(FIRST_ALPHABETICALLY);
        expect(resolveActiveTeam({ teamIds: [A, B] })).toBe(FIRST_ALPHABETICALLY);
    });

    /**
     * `localStorage` IS USER-EDITABLE. Typing another department's team id into it
     * must not aim the app at that department — it falls through to the next rule
     * rather than being honoured.
     */
    it('ignores a tampered or stale stored value instead of honouring it', () => {
        expect(resolveActiveTeam({ teamIds: [A, B], stored: OTHER })).toBe(FIRST_ALPHABETICALLY);
        expect(resolveActiveTeam({ teamIds: [A, B], stored: '../../sgh-physiotherapy' }))
            .toBe(FIRST_ALPHABETICALLY);
    });

    /**
     * The case that happens for real: a lead is removed from team B while looking
     * at it. The next resolve must move them somewhere they are still allowed to be
     * rather than leaving them pointed at a team they have lost.
     */
    it('moves a user off a team they have just been removed from', () => {
        expect(resolveActiveTeam({ teamIds: [A], previous: B, stored: B })).toBe(A);
    });

    it('returns NO_TEAM when the last team is removed, rather than a stale id', () => {
        expect(resolveActiveTeam({ teamIds: [], previous: A, stored: A })).toBe(NO_TEAM);
    });
});

describe('needsSwitcher', () => {
    /**
     * Most people are in exactly one team forever. A control that only ever offers
     * one option is furniture to read and dismiss on every visit.
     */
    it('is false for nobody and for one team, true for two', () => {
        expect(needsSwitcher([])).toBe(false);
        expect(needsSwitcher([A])).toBe(false);
        expect(needsSwitcher([A, A])).toBe(false);      // duplicates are one team
        expect(needsSwitcher([A, B])).toBe(true);
    });
});

describe('teamLabel', () => {
    it('reads department first, then institution', () => {
        expect(teamLabel({ department: 'Respiratory Therapy', institution: 'KKH' }))
            .toBe('Respiratory Therapy — KKH');
    });

    /**
     * A blank team name looks like a loading bug and sends people looking for a
     * cause that is not there. Every degraded shape still produces something
     * nameable, ending at the id itself.
     */
    it('never renders empty while there is anything to show', () => {
        expect(teamLabel({ name: 'Sport & Exercise Medicine' })).toBe('Sport & Exercise Medicine');
        expect(teamLabel({ institution: 'KKH' })).toBe('KKH');
        expect(teamLabel({ id: A })).toBe(A);
        expect(teamLabel({ department: '   ', id: A })).toBe(A);
    });

    it('returns an empty string only when there is genuinely nothing', () => {
        expect(teamLabel({})).toBe('');
        expect(teamLabel(null)).toBe('');
        expect(teamLabel('kkh')).toBe('');
    });
});

describe('the storage key', () => {
    it('is namespaced, so it cannot collide with another app on the same origin', () => {
        expect(LAST_TEAM_KEY.startsWith('nexus_')).toBe(true);
    });
});
