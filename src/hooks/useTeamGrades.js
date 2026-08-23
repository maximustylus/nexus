/**
 * ==============================================================================
 * useTeamGrades — the one place the roster is allowed to learn what people earn
 * ==============================================================================
 *
 * `generateRosterV2` needs every rostered person's grade: `bandOfGrade` turns it
 * into a band, and the band decides who may LEAD a shift and whether a task's
 * grade floor is met. So the roster genuinely cannot work without this.
 *
 * ⚠️ IT IS A HOOK RATHER THAN PART OF `TeamContext`, AND THAT IS THE WHOLE POINT.
 *
 *    `TeamContext` is read by every screen in the app — the feed, the profile, the
 *    wellbeing board, the admin panel. Putting grades in it would make the most
 *    sensitive value in the team ambiently available to components that have no
 *    business with it, and the next person to add a debug render of the context
 *    would publish the department's pay scale by accident.
 *
 *    This is imported by ONE file, `RosterView`, at the one moment the numbers are
 *    actually needed. `grep -rn useTeamGrades src/` is the complete list of places
 *    grades can reach, and keeping that list at one entry is the design.
 *
 * ⚠️ AND IT IS LEAD-ONLY, ENFORCED SERVER-SIDE. `firestore.rules` grants
 *    `teams/{id}/grades/{uid}` to `isSelf(uid) || isLead(teamId)`. A staff member
 *    calling this gets permission-denied on every colleague — which is correct, so
 *    the hook does not even try unless `enabled`. Skipping the request is a
 *    courtesy to the console, not the control; the rule is the control.
 *
 * ── WHY `getDoc` PER MEMBER AND NOT A QUERY ──────────────────────────────────
 *
 * `list` is denied on the collection to everybody, including a lead. That is
 * deliberate: a lead can already assemble the same information one document at a
 * time from the member list they hold, so denying `list` costs nothing — and it
 * removes the artefact the split exists to prevent, a single query returning every
 * salary band in the department.
 *
 * The cost is N reads instead of one, where N is a department: twenty, not twenty
 * thousand. They are issued in parallel and only when the roster is being
 * configured.
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { gradePath } from '../utils/teamPaths';

/**
 * @returns {{ grades: Record<string, string>, loading: boolean, denied: boolean }}
 *   `grades` is uid → grade, missing for anybody who has not set one. An absent
 *   entry is NOT an error and must not be reported as one: a member document
 *   starts with no grade at all, and the engine's own answer to an ungraded person
 *   is to bar them from band-gated leads and say so by name.
 */
export const useTeamGrades = (teamId, members, enabled = true) => {
    const [grades, setGrades] = useState({});
    const [loading, setLoading] = useState(false);
    const [denied, setDenied] = useState(false);

    // The uids, as a stable string, so the effect re-runs when the MEMBERSHIP
    // changes and not when the array identity does. `members` is rebuilt by
    // `TeamContext`'s `useMemo` on every snapshot, so depending on it directly
    // would refetch every grade in the department on any unrelated team edit.
    const uidKey = (members || []).map((person) => person.uid).filter(Boolean).sort().join(',');

    useEffect(() => {
        if (!enabled || !teamId || uidKey === '') { setGrades({}); setDenied(false); return undefined; }

        let cancelled = false;
        const uids = uidKey.split(',');
        setLoading(true);

        Promise.all(uids.map(async (uid) => {
            try {
                const snap = await getDoc(doc(db, ...gradePath(teamId, uid)));
                return [uid, snap.exists() ? (snap.data().grade || '') : ''];
            } catch (error) {
                /**
                 * ⚠️ ONE DENIAL IS THE WHOLE ANSWER, NOT ONE MISSING PERSON. A
                 *    caller who is not a lead is refused for EVERY colleague, and
                 *    reporting that as "these people have no grade" would produce a
                 *    roster generated as though nobody in the department held any
                 *    grade at all — plausible, silent, and wrong. It is flagged
                 *    instead, and `RosterView` refuses to generate on it.
                 */
                return [uid, null];
            }
        })).then((entries) => {
            if (cancelled) return;
            const refused = entries.some(([, value]) => value === null);
            setDenied(refused);
            setGrades(Object.fromEntries(
                entries.filter(([, value]) => value !== null),
            ));
            setLoading(false);
        });

        return () => { cancelled = true; };
    }, [teamId, uidKey, enabled]);

    return { grades, loading, denied };
};

export default useTeamGrades;
