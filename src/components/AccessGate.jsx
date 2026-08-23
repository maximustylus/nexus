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

import React, { useState } from 'react';
import {
    MailCheck, Hourglass, ShieldX, UserPlus, LogOut, RefreshCw, FlaskConical, Building2,
} from 'lucide-react';
import {
    ACCESS_UNVERIFIED,
    ACCESS_PENDING_LEAD,
    ACCESS_DECLINED,
    ACCESS_AWAITING_INVITE,
    ROLE_OPTIONS,
    ROLE_LEAD,
    validateLeadDeclaration,
} from '../utils/accessPolicy';
import LeadDeclarationFields from './LeadDeclarationFields';

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
        next: 'Ask your team lead or roster master to add you. If you run a department yourself, say so below.',
    },
});

const TONES = Object.freeze({
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50',
    indigo: 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800/50',
    rose: 'bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800/50',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700',
});

/**
 * The declaration, asked here rather than only at registration.
 *
 * ⚠️ THE GAP THIS CLOSES. `lead_requests/{uid}` was written in exactly one place —
 *    inside `WelcomeScreen`'s sign-up handler, behind `if (declaring)`. Somebody who
 *    registered without ticking that box and turned out to lead a department had no
 *    route to say so, ever: this screen offered "Check again" and "Sign out", and
 *    registering again fails with `auth/email-already-in-use`. For an announcement
 *    aimed at department leads, that was the single most likely person to arrive
 *    here.
 *
 *    `firestore.rules` already permits it — `allow create: if isSelf(requestUid)`
 *    with a shape check — so this needed no rules change, only a door.
 *
 * ⚠️ ONLY FROM `awaiting-invite`. A declined request cannot be replaced: the rules
 *    say `allow update: if false`, so a second attempt would be refused by the
 *    server and the person would be told it worked. Re-declaring is a decision
 *    about what a decline means, and it belongs with whoever answers these.
 */
const DeclarePanel = ({ onDeclareLead }) => {
    const [open, setOpen] = useState(false);
    const [role, setRole] = useState(ROLE_LEAD);
    const [institution, setInstitution] = useState('');
    const [department, setDepartment] = useState('');
    const [profession, setProfession] = useState('');
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const [failure, setFailure] = useState('');

    if (done) {
        return (
            <p className="text-xs font-bold rounded-xl border px-4 py-3 mb-4 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/50">
                Your request is lodged. An administrator reviews it and creates the team — usually
                within a working day. Press <strong>Check again</strong> once they have.
            </p>
        );
    }

    if (!open) {
        return (
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="w-full min-h-[44px] px-4 mb-3 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-xs font-black uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
                <Building2 size={15} /> I run a department
            </button>
        );
    }

    const submit = async (event) => {
        event.preventDefault();
        const declaration = { role, institution, department, profession };
        const { ok, errors: found } = validateLeadDeclaration(declaration);
        setErrors(found);
        if (!ok) return;

        setBusy(true);
        setFailure('');
        try {
            await onDeclareLead(declaration);
            setDone(true);
        } catch (error) {
            // ⚠️ NAMED, NOT SWALLOWED. The most likely failure is a rules refusal,
            //    and "something went wrong" would send somebody to IT for a
            //    department name with a character the id cannot carry.
            setFailure(error?.message || 'The request could not be lodged. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="mb-4 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/50 dark:bg-indigo-900/10 space-y-4">
            <p className="text-[10px] font-bold text-slate-600 dark:text-slate-300 leading-relaxed">
                Tell us which team you run. It is created once an administrator approves your
                request — after that you manage your own people.
            </p>

            <div>
                <select
                    aria-label="Your role"
                    value={role}
                    disabled={busy}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-white dark:bg-[#1f2937] border border-slate-200 dark:border-slate-700 shadow-sm rounded-xl py-4 px-4 text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                    {ROLE_OPTIONS.filter((option) => option.declares).map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                    ))}
                </select>
                {errors.role && (
                    <p className="mt-1 text-[10px] font-bold text-red-600 dark:text-red-400">{errors.role}</p>
                )}
            </div>

            <LeadDeclarationFields
                institution={institution} onInstitution={setInstitution}
                department={department} onDepartment={setDepartment}
                profession={profession} onProfession={setProfession}
                errors={errors}
                disabled={busy}
            />

            {failure && (
                <p className="text-[10px] font-bold text-red-600 dark:text-red-400">{failure}</p>
            )}

            <div className="flex gap-2">
                <button
                    type="submit"
                    disabled={busy}
                    className="flex-1 min-h-[44px] px-4 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
                >
                    {busy ? 'Sending…' : 'Send request'}
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => setOpen(false)}
                    className="min-h-[44px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
                >
                    Cancel
                </button>
            </div>
        </form>
    );
};

const AccessGate = ({ state, email, onSignOut, onRetry, onExploreSandbox, onDeclareLead }) => {
    const screen = SCREENS[state] || SCREENS[ACCESS_AWAITING_INVITE];
    const Icon = screen.icon;
    // The declaration is only writable when no request exists — see `DeclarePanel`.
    const canDeclare = !!onDeclareLead && state === ACCESS_AWAITING_INVITE;

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

                {canDeclare && <DeclarePanel onDeclareLead={onDeclareLead} />}

                {/*
                  ⚠️ THE SANDBOX IS OFFERED FROM EVERY WAITING STATE, AND THAT IS THE
                     POINT OF THIS SCREEN NOW.
                
                  Whatever is being waited on — a verification email, an approval, an
                  invitation — the answer used to be a page with "Check again" and
                  "Sign out" on it. Somebody who had just been told to try NEXUS
                  signed in, read a sentence, and signed out. That is the whole
                  experience, and it is the one a department-wide announcement would
                  have produced for most of the people who received it.
                
                  The sandbox needs no team, no invitation and no approval — it is the
                  rostering engine over a fictional department. It was already
                  reachable from the SIGNED-OUT screen (`WelcomeScreen.handleDemoEnter`)
                  and unreachable from here, which is exactly backwards: the person who
                  has bothered to register is the one who wants to see it.
                
                  `App.jsx`'s gate already reads `!isDemo`, so entering the sandbox
                  admits them to the shell without any change to who may see real data.
                */}
                {onExploreSandbox && (
                    <div className="mb-6 rounded-xl border border-teal-200 dark:border-teal-800/50 bg-teal-50/60 dark:bg-teal-500/10 p-4">
                        <p className="text-xs font-bold text-teal-800 dark:text-teal-300 mb-1">
                            Want to see how it works while you wait?
                        </p>
                        <p className="text-[11px] text-teal-700/80 dark:text-teal-400/80 leading-relaxed mb-3">
                            The sandbox is the full rostering engine over a made-up department.
                            Nothing in it is real, nothing you do there is saved, and it does not
                            change what you can see here.
                        </p>
                        <button
                            type="button"
                            onClick={onExploreSandbox}
                            className="w-full min-h-[44px] px-4 rounded-xl bg-teal-600 text-white text-xs font-black uppercase tracking-widest hover:bg-teal-700 active:scale-95 transition-all flex items-center justify-center gap-2"
                        >
                            <FlaskConical size={15} /> Explore the sandbox
                        </button>
                    </div>
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
