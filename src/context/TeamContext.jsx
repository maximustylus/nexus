/**
 * ==============================================================================
 * TEAM CONTEXT — THE ARGUMENT EVERY SCREEN HAS BUT NEVER STATED
 * ==============================================================================
 *
 * Once a clinician can belong to more than one team, "the roster" is an incomplete
 * sentence. This provider holds the missing half — *whose* roster — and hands it to
 * everything below it, so no screen has to work it out and no two screens can work
 * it out differently.
 *
 * ── WHAT IT EXPOSES, AND WHY EACH ONE ────────────────────────────────────────
 *
 *   teamId        the active team, or null. THE argument.
 *   team          its document, for a heading.
 *   teams         every team the user is in, for the switcher.
 *   membership    the caller's own `members/{uid}` document — role, grade, FTE.
 *   rosteredMembers  those who hold clinical duties — the staff pool. A separate
 *                 question from `role`; see the field itself for why.
 *   members       everyone in the active team. THIS IS WHAT REPLACES
 *                 `TEAM_DIRECTORY` — ten people hardcoded in `src/utils/index.js`
 *                 with nine consumers, and the reason onboarding a clinician used
 *                 to require a code deploy.
 *   memberUidByName  for controls that let somebody pick a colleague by name.
 *   isLead        whether they may configure and invite. Derived here, once.
 *   canActOn(id)  ⚠️ the guard anything that WRITES must consult.
 *   switchTeam    changes the active team, refusing ids the user is not in.
 *   loading       true until membership is known.
 *
 * ── WHY `isLead` LIVES HERE ──────────────────────────────────────────────────
 *
 * The old app decided admin-ness with `ADMIN_EMAILS` — two addresses in an array in
 * `App.jsx`. Under multi-team the same person is a lead in one department and staff
 * in another, so the question is not "who is this" but "who is this HERE". It is
 * answered once, from the membership document, and never re-derived from an email.
 *
 * ⚠️ `isLead` IS PRESENTATION, NOT PERMISSION. It decides which buttons render.
 * What a lead may actually WRITE is enforced by `firestore.rules` against the same
 * membership document, and by the callable functions. A client-side boolean has
 * never protected anything.
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { doc, collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { teamPath, memberPath, membersPath, userPath } from '../utils/teamPaths';
import {
    resolveActiveTeam,
    normaliseTeamIds,
    canActOn as canActOnTeam,
    needsSwitcher,
    LAST_TEAM_KEY,
} from '../utils/teamSelection';

const TeamContext = createContext(null);

/**
 * `localStorage` throws in Safari private browsing and is absent in some embedded
 * webviews. Remembering a team is a convenience; losing it must never be an error,
 * so both directions swallow.
 */
const readStoredTeam = () => {
    try { return window.localStorage.getItem(LAST_TEAM_KEY); } catch { return null; }
};
const writeStoredTeam = (teamId) => {
    try {
        if (teamId) window.localStorage.setItem(LAST_TEAM_KEY, teamId);
        else window.localStorage.removeItem(LAST_TEAM_KEY);
    } catch { /* not remembering is not a failure */ }
};

export const TeamProvider = ({ uid, children }) => {
    const [teamIds, setTeamIds] = useState([]);
    const [activeTeamId, setActiveTeamId] = useState(null);
    const [team, setTeam] = useState(null);
    const [teams, setTeams] = useState({});
    const [membership, setMembership] = useState(null);
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    // ── 1. Which teams does this person belong to? ───────────────────────────
    useEffect(() => {
        if (!uid) {
            setTeamIds([]);
            setActiveTeamId(null);
            setLoading(false);
            return undefined;
        }

        setLoading(true);
        const unsubscribe = onSnapshot(
            doc(db, ...userPath(uid)),
            (snapshot) => {
                const next = normaliseTeamIds(snapshot.exists() ? snapshot.data().teamIds : []);
                setTeamIds(next);
                // Re-resolved on EVERY change, not only on mount: this is what moves
                // somebody off a team they have just been removed from instead of
                // leaving them pointed at data they can no longer read.
                setActiveTeamId((previous) => resolveActiveTeam({
                    teamIds: next,
                    stored: readStoredTeam(),
                    previous,
                }));
                setLoading(false);
            },
            (error) => {
                // Fail to NO team rather than to a stale one. An unreadable profile
                // must not leave the app aimed at a team it cannot verify.
                console.error('[NEXUS] could not read team membership.', error);
                setTeamIds([]);
                setActiveTeamId(null);
                setLoading(false);
            },
        );

        return unsubscribe;
    }, [uid]);

    useEffect(() => { writeStoredTeam(activeTeamId); }, [activeTeamId]);

    // ── 2. The active team's document, and the caller's membership in it ─────
    useEffect(() => {
        if (!uid || !activeTeamId) {
            setTeam(null);
            setMembership(null);
            return undefined;
        }

        const unsubTeam = onSnapshot(
            doc(db, ...teamPath(activeTeamId)),
            (snapshot) => setTeam(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null),
            (error) => { console.error('[NEXUS] could not read the team.', error); setTeam(null); },
        );

        const unsubMember = onSnapshot(
            doc(db, ...memberPath(activeTeamId, uid)),
            (snapshot) => setMembership(snapshot.exists() ? { uid: snapshot.id, ...snapshot.data() } : null),
            (error) => { console.error('[NEXUS] could not read membership.', error); setMembership(null); },
        );

        return () => { unsubTeam(); unsubMember(); };
    }, [uid, activeTeamId]);

    /**
     * ── 2b. THE MEMBER LIST — WHAT REPLACES `TEAM_DIRECTORY` ─────────────────
     *
     * Ten people hardcoded in `src/utils/index.js`, with nine consumers, becomes a
     * subcollection a lead maintains themselves. This is the single change that
     * makes onboarding a clinician stop being a code deploy.
     *
     * Sorted by display name so every list built from it — roster staff pool,
     * swap target picker, load editor — presents people in the same order. Lists
     * that reorder between screens make a reader check twice.
     *
     * `uid` is the key and `displayName` is a field, which is the whole point: a
     * rename changes what is rendered and breaks nothing that routes.
     */
    useEffect(() => {
        if (!activeTeamId) {
            setMembers([]);
            return undefined;
        }

        return onSnapshot(
            collection(db, ...membersPath(activeTeamId)),
            (snapshot) => setMembers(
                snapshot.docs
                    .map((entry) => ({ uid: entry.id, ...entry.data() }))
                    .sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''), 'en')),
            ),
            (error) => {
                // Empty, not stale. A member list left over from a team the caller
                // can no longer read would put the wrong names in a staff pool.
                console.error('[NEXUS] could not read the member list.', error);
                setMembers([]);
            },
        );
    }, [activeTeamId]);

    // ── 3. Every team the user is in, for the switcher ───────────────────────
    // Only subscribed when there is more than one; a solo member's switcher is
    // never rendered, so paying for the reads would be pure waste.
    useEffect(() => {
        if (!needsSwitcher(teamIds)) {
            setTeams({});
            return undefined;
        }

        const unsubscribers = teamIds.map((id) => onSnapshot(
            doc(db, ...teamPath(id)),
            (snapshot) => setTeams((prev) => ({
                ...prev,
                [id]: snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : { id },
            })),
            () => setTeams((prev) => ({ ...prev, [id]: { id } })),
        ));

        return () => unsubscribers.forEach((stop) => stop());
    }, [teamIds]);

    /**
     * ⚠️ REFUSES A TEAM THE USER IS NOT IN. The id can arrive from a URL, a stale
     * bookmark or a hand-edited `localStorage`; none of those are evidence of
     * membership. Refusing here means no write is ever composed under a team the
     * caller does not belong to.
     */
    const switchTeam = useCallback((nextId) => {
        setActiveTeamId((previous) => (canActOnTeam(nextId, teamIds) ? nextId.trim() : previous));
    }, [teamIds]);

    const value = useMemo(() => ({
        teamId: activeTeamId,
        team,
        teamIds,
        teams: teamIds.map((id) => teams[id] || { id }),
        membership,
        members,
        /**
         * THE PEOPLE WHO HOLD DUTIES — the staff pool the generator draws from and
         * the rows the clinical-load table shows. NOT the same question as `role`,
         * and conflating them was a real modelling error:
         *
         *   • a ROSTER MASTER configures and generates but carries no load —
         *     `role: 'lead'`, `rostered: false`. Filter the pool by role and the
         *     engine hands her duties she does not do.
         *   • a service LEAD may practise as well — `role: 'lead'`,
         *     `rostered: true`. Exclude leads from the pool and the department loses
         *     one of its clinicians.
         *
         * Both exist in the first team, so no single field can answer both.
         *
         * Defaults to TRUE for a membership written before this field existed: the
         * old model had no way to say "not rostered", so the safe reading of a
         * missing value is the one everybody in it shared.
         */
        rosteredMembers: members.filter((person) => person.rostered !== false),
        /**
         * Name → uid, for the one direction the app genuinely needs: a control that
         * lets somebody PICK a colleague by name still has to record WHO that is.
         * Built once here so no screen writes its own lookup over whatever list it
         * happened to have in scope.
         *
         * ⚠️ TWO MEMBERS WITH THE SAME DISPLAY NAME RESOLVE TO ONE UID — the one
         *    that sorts first, deterministically (the reverse is so the first
         *    entry, not the last, survives `fromEntries`). Team-scoping has already
         *    removed the collision that mattered: a Sarah at KKH and a Sarah at SGH
         *    are now in different subcollections and cannot touch each other's data.
         *    What remains is two Sarahs in ONE department, where the lead owns the
         *    member list and can write "Sarah T." — a fix that takes ten seconds and
         *    needs no deploy. It is a real limitation, it is bounded, and it is
         *    named rather than papered over.
         */
        memberUidByName: Object.fromEntries(
            [...members].reverse().map((person) => [person.displayName, person.uid]),
        ),
        // No membership document means no lead powers, which is the correct answer
        // while the document is still loading as well as when it is genuinely absent.
        isLead: membership?.role === 'lead',
        canActOn: (id) => canActOnTeam(id, teamIds),
        showSwitcher: needsSwitcher(teamIds),
        switchTeam,
        loading,
    }), [activeTeamId, team, teamIds, teams, membership, members, switchTeam, loading]);

    return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>;
};

/**
 * Returns a safe, inert context outside a provider rather than `undefined`. The
 * alternative is `useTeam().teamId` throwing in demo mode and on the public portal,
 * neither of which has a team — and a crash there would be a worse bug than the one
 * the strictness was guarding against.
 */
const INERT = Object.freeze({
    teamId: null,
    team: null,
    teamIds: [],
    teams: [],
    membership: null,
    members: [],
    rosteredMembers: [],
    memberUidByName: {},
    isLead: false,
    canActOn: () => false,
    showSwitcher: false,
    switchTeam: () => {},
    loading: false,
});

export const useTeam = () => useContext(TeamContext) || INERT;
