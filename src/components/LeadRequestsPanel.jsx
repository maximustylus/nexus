/**
 * ==============================================================================
 * LEAD REQUESTS — THE APPROVAL QUEUE
 * ==============================================================================
 *
 * The screen where a super-admin turns a lead's declaration into a team. Roughly 28
 * uses across the cluster and then a long tail, which is what shapes it: this is not
 * a dashboard anyone lives in, it is a queue somebody clears occasionally and must
 * be able to read cold.
 *
 * ── WHY IT CALLS FUNCTIONS AND NEVER QUERIES ─────────────────────────────────
 *
 * `firestore.rules` denies `list` on `lead_requests` to EVERYBODY, administrators
 * included. So this screen cannot query; it calls `listLeadRequests`. That is a
 * deliberate trade: it costs a round trip, and it buys the rules file never needing
 * to know who the super-admins are — which is what keeps a third copy of the team
 * out of `firestore.rules`, one of the defects the rebuild removes.
 *
 * ⚠️ THIS SCREEN IS NOT A SECURITY BOUNDARY, and must not be mistaken for one. It
 *    renders for anyone who reaches the route. Every call it makes is refused by
 *    `requireSuperAdmin` on the server unless the caller is genuinely an approver —
 *    so a non-approver who finds this page sees an error, not a queue. Hiding the
 *    route would be presentation; the refusal is the control.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { ShieldCheck, Check, X, Loader2, Inbox, AlertCircle, RefreshCw, Building2 } from 'lucide-react';

// The region is pinned, as it is at every other call site in the app
// (`AuraChat.jsx:10`, `FeedsView.jsx:157`). An unpinned `getFunctions()` happens to
// default to the same region today, which is exactly the kind of agreement that
// stops being true quietly.
const call = (name) => httpsCallable(getFunctions(undefined, 'us-central1'), name);

/**
 * Firebase wraps thrown HttpsErrors; the readable half is `message`.
 *
 * ⚠️ ONE CASE IS NOT A REFUSAL AND MUST NOT READ LIKE ONE. `team-exists` with
 *    `collision` set means two DIFFERENT departments slug to the same team id — the
 *    request may be for a real, new department that simply cannot have that id. The
 *    owner has to decide, so the sentence is marked rather than shown as another
 *    thing that went wrong. Everything else is left exactly as the server phrased it.
 *
 *    (The `detailCode` ternary this replaces returned the same string in both
 *    branches, so the code it read was never used for anything.)
 */
const readError = (error) => {
    const message = error?.message || 'Something went wrong.';
    return error?.details?.collision ? `⚠️ Needs your decision — ${message}` : message;
};

const LeadRequestsPanel = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [busyUid, setBusyUid] = useState('');
    const [notice, setNotice] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await call('listLeadRequests')({ status: 'pending' });
            setRequests(result.data?.requests || []);
        } catch (err) {
            setError(readError(err));
            setRequests([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /**
     * One handler for both decisions. The list is reloaded rather than patched in
     * place: approving can fail server-side for reasons this screen cannot see —
     * the team already exists under another name, the account is unverified — and a
     * locally-patched list would show a decision that never happened.
     */
    const decide = async (uid, approve, reason) => {
        setBusyUid(uid);
        setError('');
        setNotice('');
        try {
            if (approve) {
                const result = await call('approveLeadRequest')({ requestUid: uid });
                setNotice(result.data?.alreadyApproved
                    ? `Already approved — team ${result.data.teamId}.`
                    : `Team ${result.data.teamId} created. Its lead can now invite their own staff.`);
            } else {
                await call('declineLeadRequest')({ requestUid: uid, reason });
                setNotice('Request declined.');
            }
            await load();
        } catch (err) {
            setError(readError(err));
        } finally {
            setBusyUid('');
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-4 md:p-6">
            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <ShieldCheck size={22} className="text-indigo-500" /> Team requests
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Approving creates the team and makes this person its lead. From then on they
                        invite and remove their own staff without coming back here.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={load}
                    disabled={loading}
                    className="shrink-0 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
                </button>
            </div>

            {error && (
                <div className="mb-4 p-3 rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs font-bold flex gap-3 items-start">
                    <AlertCircle size={16} className="shrink-0 mt-0.5" /> <span>{error}</span>
                </div>
            )}

            {notice && (
                <div className="mb-4 p-3 rounded-xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                    {notice}
                </div>
            )}

            {loading && requests.length === 0 && (
                <div className="p-12 flex justify-center text-slate-400">
                    <Loader2 size={28} className="animate-spin" />
                </div>
            )}

            {!loading && requests.length === 0 && !error && (
                <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <Inbox className="mx-auto text-slate-300 dark:text-slate-600 mb-2" size={32} />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                        Nothing waiting
                    </p>
                </div>
            )}

            <ul className="space-y-3">
                {requests.map((request) => (
                    <li
                        key={request.id}
                        className="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                    >
                        <div className="flex items-start gap-3 mb-3">
                            <div className="bg-indigo-500/10 p-2 rounded-lg h-fit">
                                <Building2 size={18} className="text-indigo-500" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                                    {request.department || '(no department)'} — {request.institution || '(no institution)'}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                    {request.displayName || 'Unnamed'} · {request.email}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-1">
                                    Declared as {request.role}
                                    {request.profession ? ` · ${request.profession}` : ''}
                                </p>
                                {/*
                                  The proposed id is shown because it is what the person
                                  saw at registration — but the server re-derives it and
                                  is authoritative, so this is labelled as a proposal
                                  rather than presented as fact.
                                */}
                                <p className="text-[11px] font-mono text-slate-400 mt-1 break-all">
                                    proposed: {request.proposedTeamId || '—'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2">
                            <button
                                type="button"
                                disabled={busyUid === request.id}
                                onClick={() => decide(request.id, true)}
                                className="flex-1 min-h-[44px] px-4 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {busyUid === request.id
                                    ? <Loader2 size={15} className="animate-spin" />
                                    : <Check size={15} />} Approve
                            </button>
                            <button
                                type="button"
                                disabled={busyUid === request.id}
                                onClick={() => {
                                    // `window.prompt` rather than an inline form, deliberately: this
                                    // queue is cleared roughly 28 times and then rarely, and a
                                    // per-row expanding textarea is state and layout nobody
                                    // benefits from at that frequency. Cancel returns null and is
                                    // treated as "changed my mind", not as an empty reason.
                                    const reason = window.prompt('Why is this being declined? The person sees this.');
                                    if (reason !== null) decide(request.id, false, reason);
                                }}
                                className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                <X size={15} /> Decline
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default LeadRequestsPanel;
