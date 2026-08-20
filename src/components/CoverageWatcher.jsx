import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowRightLeft, ShieldAlert, X } from 'lucide-react';
import { useNexus } from '../context/NexusContext';
import { useTeam } from '../context/TeamContext';
import { swapsPath } from '../utils/teamPaths';
import { readCoverageRequests, describeCoverageRequest } from '../utils/rosterCoverage';

/**
 * ==============================================================================
 * COVERAGE WATCHER — the always-mounted notifier for shift-cover requests
 * ==============================================================================
 *
 * WHY THIS EXISTS. Moving coverage requests out of the AI chat panel and into the
 * roster view was right — answering a request belongs where the roster is, not in
 * a conversation. But it regressed the guarantee the chat panel was carrying:
 *
 *   `AuraPulseBot` is mounted UNCONDITIONALLY (App.jsx, in `floatingWidgets`) and
 *   force-opened itself when a request arrived. `RosterView` is mounted only when
 *   `currentView === 'roster'` (App.jsx:771). So once the listener moved into the
 *   roster, a colleague sitting on Dashboard, Pulse or Feeds was never told
 *   anything — the request reached NOBODY until they happened to open the Roster
 *   tab. The bell reads `notifications`, not `shift_swaps`, and there is no Cloud
 *   Function pushing these (`grep -rn shift_swaps functions/` is empty).
 *
 * That is ROSTER_QC_AUDIT.md M5 returning by a different route, and it was found
 * by an independent audit rather than by the change that caused it.
 *
 * SO: exactly one surface ANSWERS a request (the roster, which owns the verified
 * mutation sequence), and exactly one surface NOTICES one (this, mounted always).
 * This component deliberately holds NO mutation logic and no accept/decline —
 * it tells you, and it takes you there. Two notifiers would be a worse bug than
 * the one being fixed, which is why the chat listener stays deleted.
 *
 * LIVE MODE ONLY. A simulation must never see a real clinician's request.
 * ==============================================================================
 */
const CoverageWatcher = ({ user, onOpenRoster, isRosterVisible }) => {
    const { isDemo } = useNexus();
    const { teamId } = useTeam();
    const [requests, setRequests] = useState([]);
    const [listenerError, setListenerError] = useState(null);
    const [dismissed, setDismissed] = useState(() => new Set());

    // ROUTED BY UID, NOT BY NAME. `where('targetStaff','==',user.name)` meant that
    // editing your display name in your profile silently stopped every coverage
    // request from reaching you — and a query matching nothing looks exactly like
    // nobody having asked. This component exists to notice; routing it by a mutable
    // string was the one way it could fail without saying so.
    const targetUid = user?.uid;

    useEffect(() => {
        if (isDemo || !teamId || !targetUid) return undefined;

        const q = query(
            collection(db, ...swapsPath(teamId)),
            where('targetUid', '==', targetUid),
            where('status', '==', 'PENDING'),
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                setListenerError(null);
                setRequests(readCoverageRequests(snapshot));
            },
            // 🛡️ M8: a rules denial used to vanish silently. It must surface
            // somewhere even when the roster is not on screen — that is the whole
            // point of this component being always mounted.
            (error) => {
                console.error('[NEXUS] Coverage watcher failed:', error.code, error.message);
                setListenerError(
                    error.code === 'permission-denied'
                        ? 'I am not permitted to read coverage requests, so I cannot tell you when a colleague asks you to cover. Please tell an administrator.'
                        : 'I lost the connection to coverage requests. Reload the page to start listening again.',
                );
            },
        );

        return () => unsubscribe();
    }, [isDemo, teamId, targetUid]);

    const dismiss = useCallback((id) => {
        setDismissed((prev) => new Set(prev).add(id));
    }, []);

    // Requests worth interrupting for: still pending, not dismissed this session.
    const outstanding = requests.filter((request) => !dismissed.has(request.docId));

    // Nothing to say, or the roster is already on screen and owns the surface —
    // in which case a second banner would just be noise over the real thing.
    if (listenerError === null && (outstanding.length === 0 || isRosterVisible)) return null;

    return (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-24 xl:bottom-8 z-[115] w-[min(28rem,calc(100vw-2rem))] space-y-2">
            {listenerError && (
                <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 shadow-2xl p-4 flex items-start gap-2">
                    <ShieldAlert size={16} className="shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                    <p className="text-xs font-bold text-red-700 dark:text-red-300 leading-relaxed">{listenerError}</p>
                </div>
            )}

            {outstanding.map((request) => (
                <div
                    key={request.docId}
                    role="status"
                    className="rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300"
                >
                    <div className="bg-amber-500/10 dark:bg-amber-500/20 px-4 py-2 flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-amber-700 dark:text-amber-300">
                            <ArrowRightLeft size={12} /> Someone needs cover
                        </span>
                        <button
                            type="button"
                            onClick={() => dismiss(request.docId)}
                            aria-label="Dismiss this coverage notice"
                            className="p-1 rounded-full hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="p-4">
                        <p className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
                            {describeCoverageRequest(request)}
                        </p>
                        <button
                            type="button"
                            onClick={() => { if (onOpenRoster) onOpenRoster(); }}
                            className="mt-3 w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[11px] uppercase tracking-widest transition-colors"
                        >
                            Open the roster to answer
                        </button>
                        {/* Answering happens in the roster, which owns the verified
                            read-back sequence. Saying so here stops this banner from
                            looking like a broken Accept button. */}
                        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
                            You accept or decline on the shift itself, so you can see the week you would be taking on.
                        </p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default CoverageWatcher;
