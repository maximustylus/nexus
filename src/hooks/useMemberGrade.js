/**
 * ==============================================================================
 * useMemberGrade — ONE person's grade, read only when a lead asks to see it
 * ==============================================================================
 *
 * The sibling of `useTeamGrades`, and the difference between them is the whole
 * privacy argument rather than a convenience:
 *
 *   `useTeamGrades`  — EVERY rostered member's grade, because `generateRosterV2`
 *                      cannot band-gate a lead shift without them. One read per
 *                      member, at the moment a roster is being configured.
 *
 *   `useMemberGrade` — ONE member's grade, on demand, because a lead has opened
 *                      that one person's editor and is about to correct it.
 *
 * ⚠️ WHY THIS IS NOT `useTeamGrades` WITH A FILTER, WHICH WAS THE OBVIOUS MOVE.
 *
 *    `TeamMembersPanel` renders for a NON-lead too, read-only. A hook that loaded
 *    the department's grades into that component's state would put every colleague's
 *    pay grade one prop — or one debug render — away from a screen that must never
 *    show a grade column at all. The rules would still refuse a non-lead, so nothing
 *    would leak today; the hazard is the shape, and it survives longer than the
 *    person who understood it.
 *
 *    So the grade never enters the list. It is fetched when a lead opens one
 *    editor, held for that editor, and dropped when it closes. `uid === ''` is the
 *    closed state and it clears rather than keeps.
 *
 * ⚠️ AND A DENIAL IS NOT AN EMPTY GRADE. `firestore.rules` grants
 *    `teams/{id}/grades/{uid}` to `isSelf(uid) || isLead(teamId)` — so a non-lead
 *    reading a colleague is refused, and reporting that as "they have not set one"
 *    would invite a lead-shaped UI to write a grade over a value it never read.
 *    `denied` is separate from `grade` for that reason, and the editor refuses to
 *    save on it.
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { gradePath } from '../utils/teamPaths';

/**
 * @param {string} teamId
 * @param {string} uid  the member whose grade to read; `''` closes and clears
 * @returns {{ grade: string, setBy: string, loading: boolean, denied: boolean }}
 *   `grade` is `''` for somebody who has never set one — a real state, not an
 *   error. `setBy` is `'self'`, `'lead'` or `''` when the document predates the
 *   field or does not exist.
 */
export const useMemberGrade = (teamId, uid) => {
    const [grade, setGrade] = useState('');
    const [setBy, setSetBy] = useState('');
    const [loading, setLoading] = useState(false);
    const [denied, setDenied] = useState(false);

    useEffect(() => {
        if (!teamId || !uid) {
            setGrade(''); setSetBy(''); setDenied(false); setLoading(false);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);
        setDenied(false);

        getDoc(doc(db, ...gradePath(teamId, uid)))
            .then((snap) => {
                if (cancelled) return;
                const data = snap.exists() ? (snap.data() || {}) : {};
                setGrade(typeof data.grade === 'string' ? data.grade : '');
                setSetBy(typeof data.setBy === 'string' ? data.setBy : '');
            })
            .catch(() => {
                if (cancelled) return;
                setGrade(''); setSetBy(''); setDenied(true);
            })
            .finally(() => { if (!cancelled) setLoading(false); });

        return () => { cancelled = true; };
    }, [teamId, uid]);

    return { grade, setBy, loading, denied };
};

export default useMemberGrade;
