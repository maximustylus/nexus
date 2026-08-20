/**
 * ==============================================================================
 * ACCESS GATE — WHAT A SIGNED-IN PERSON WITH NO TEAM SEES
 * ==============================================================================
 *
 * Before multi-team, this state did not exist: everyone who could sign in was one
 * of ten people in one department, so the app shell rendered unconditionally. Once
 * anybody at an allowlisted institution can register, the common case on day one is
 * **an authenticated user who belongs to no team at all** — and the old shell would
 * have rendered a roster with nobody in it, an empty wellbeing panel and a blank
 * feed. Every one of those looks exactly like a broken application, which is what
 * the person would reasonably report.
 *
 * So each waiting state gets a screen that says what happened, what is expected of
 * them, and who moves next. That last part is the one that is usually missing:
 * "pending approval" without "an administrator reviews these" leaves someone
 * refreshing a page for an hour.
 *
 * This component RENDERS a decision, it does not make one. `accessStateFor()` in
 * `accessPolicy.js` is the only place the decision lives, and it is unit-tested
 * there — including the case where a working clinician asks to start a second team
 * and must keep their live roster.
 */

import React from 'react';
import { MailCheck, Hourglass, ShieldX, UserPlus, LogOut, RefreshCw } from 'lucide-react';
import {
    ACCESS_UNVERIFIED,
    ACCESS_PENDING_LEAD,
    ACCESS_DECLINED,
    ACCESS_AWAITING_INVITE,
} from '../utils/accessPolicy';

/**
 * One entry per waiting state. Held as data rather than as a switch of JSX so that
 * adding a state cannot silently render nothing — the lookup below falls back to
 * the invite copy rather than to `undefined`.
 */
const SCREENS = Object.freeze({
    [ACCESS_UNVERIFIED]: {
        icon: MailCheck,
        tone: 'amber',
        title: 'Confirm your email',
        body: 'We sent a verification link to your work address. Click it, then sign in again. '
            + 'NEXUS holds clinical rosters, so an unconfirmed address never reaches team data.',
        next: 'You move next — check your inbox, including junk.',
    },
    [ACCESS_PENDING_LEAD]: {
        icon: Hourglass,
        tone: 'indigo',
        title: 'Your team is waiting for approval',
        body: 'You asked to set up a team on NEXUS. An administrator reviews the request and '
            + 'creates it — usually within a working day. Once it exists you invite and remove '
            + 'your own staff without going through anybody.',
        next: 'An administrator moves next. Nothing more is needed from you.',
    },
    [ACCESS_DECLINED]: {
        icon: ShieldX,
        tone: 'rose',
        title: 'That request was not approved',
        body: 'Your request to set up a team was declined. This is usually because the department '
            + 'already exists on NEXUS under a different name, or because the request came from '
            + 'someone other than the service lead.',
        next: 'Ask your department lead whether your team is already here, and to invite you.',
    },
    [ACCESS_AWAITING_INVITE]: {
        icon: UserPlus,
        tone: 'slate',
        title: 'You are registered. Nobody has added you to a team yet.',
        body: 'NEXUS shows you a roster once your department adds you to theirs. Your account is '
            + 'ready and waiting — there is nothing to set up.',
        next: 'Ask your team lead or roster master to invite you. They can do it themselves.',
    },
});

const TONES = Object.freeze({
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
    rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
});

const AccessGate = ({ state, email, onSignOut, onRetry }) => {
    const screen = SCREENS[state] || SCREENS[ACCESS_AWAITING_INVITE];
    const Icon = screen.icon;

    return (
        <div className="min-h-screen w-full bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4 md:p-6 font-sans">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 md:p-8">

                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border mb-6 ${TONES[screen.tone]}`}>
                    <Icon size={26} />
                </div>

                <h1 className="text-xl font-black text-slate-900 dark:text-white mb-3 leading-snug">
                    {screen.title}
                </h1>

                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-5">
                    {screen.body}
                </p>

                {/*
                  WHO MOVES NEXT. The sentence people actually need and the one that is
                  usually left out — without it, "pending" means "refresh and hope".
                */}
                <p className={`text-xs font-bold rounded-xl border px-4 py-3 mb-6 ${TONES[screen.tone]}`}>
                    {screen.next}
                </p>

                {email && (
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-6 break-all">
                        Signed in as {email}
                    </p>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                    {onRetry && (
                        <button
                            type="button"
                            onClick={onRetry}
                            className="flex-1 min-h-[44px] px-4 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={15} /> Check again
                        </button>
                    )}
                    {onSignOut && (
                        <button
                            type="button"
                            onClick={onSignOut}
                            className="flex-1 min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <LogOut size={15} /> Sign out
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AccessGate;
