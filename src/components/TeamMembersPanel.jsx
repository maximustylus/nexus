/**
 * ==============================================================================
 * TEAM MEMBERS — WHERE A LEAD ADDS AND REMOVES THEIR OWN PEOPLE
 * ==============================================================================
 *
 * This screen is the second half of the onboarding story the rebuild promised: the
 * owner approves a team ONCE, and after that the lead runs it without going back to
 * the owner for every colleague. Until `inviteMember` and `removeMember` existed
 * there was no second half — `firestore.rules` denies membership `create` and
 * `delete` outright and deferred both to Cloud Functions that had not been written,
 * so an approved team could never grow past the one person in it.
 *
 * ── WHAT REPLACED WHAT ───────────────────────────────────────────────────────
 *
 * `TEAM_DIRECTORY` in `src/utils/index.js` — ten people in an array — plus
 * `directory()` and `directoryNames()` in the rules, plus the five-name exclusion
 * list in `AdminPanel.jsx`. Onboarding one clinician used to mean editing source,
 * editing the rules and redeploying them. It is now this form.
 *
 * ── WHY THE LIST IS READ DIRECTLY BUT THE CHANGES ARE NOT ────────────────────
 *
 * `firestore.rules` grants `get, list` on `teams/{id}/members` to any member of that
 * team — the roster, the swap picker and the load table are all built from it — so
 * `TeamContext` already holds a live list and this screen renders that rather than
 * fetching its own. Writing is the opposite: `create` and `delete` are denied to
 * every client, because a lead able to mint a membership for an arbitrary uid could
 * invent one, register it, and sign in as a member of a team nobody put them in.
 *
 * ⚠️ THIS SCREEN IS NOT THE SECURITY BOUNDARY. Hiding the form from a non-lead is
 *    presentation. `readTeamContext` in `functions/index.js` re-reads the caller's
 *    membership from the database on every call and refuses anybody who is not a
 *    lead OF THAT TEAM — that refusal is the control.
 */

import React, { useState, useMemo } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
    UserPlus, Trash2, Loader2, AlertCircle, CheckCircle2, Users, ShieldCheck, Eye, Stethoscope,
} from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import { professionLabel } from '../utils/memberProfile';
import { useNexus } from '../context/NexusContext';

// Pinned region, as at every other call site (`AuraChat.jsx`, `FeedsView.jsx`,
// `LeadRequestsPanel.jsx`). An unpinned `getFunctions()` defaults to the same region
// today, which is the kind of agreement that stops being true quietly.
const call = (name) => httpsCallable(getFunctions(undefined, 'us-central1'), name);

/**
 * The three things a membership can be, with the sentence that decides between them.
 *
 * `role` and `rostered` are SEPARATE QUESTIONS everywhere in this system — a
 * department's roster master is a lead who holds no clinical duties — so the form
 * asks both. The one combination that cannot mean anything is a rostered viewer,
 * and the server forces that to `false` whatever this form sends.
 */
const ROLES = [
    { value: 'staff', label: 'Staff', hint: 'Rosters, swaps, their own wellbeing.', Icon: Stethoscope },
    { value: 'lead', label: 'Lead', hint: 'Everything staff can do, plus configuring the roster and this list.', Icon: ShieldCheck },
    { value: 'viewer', label: 'Viewer', hint: 'Reads the roster. Never appears in it.', Icon: Eye },
];

/**
 * Firebase wraps a thrown HttpsError; the readable half is `message`.
 *
 * ⚠️ MOST REFUSALS FROM THESE TWO FUNCTIONS ARE NOT THROWN. "They have not
 *    registered yet", "that domain is not registered", "that is the team's only
 *    lead" all come back as `{ success: false, message }` on a 200, deliberately:
 *    each is a sentence the lead needs to read and act on, and an HttpsError would
 *    reach the browser as a generic "internal" for several of them. A thrown error
 *    here means something genuinely unexpected.
 */
const readError = (error) => error?.message || 'Something went wrong.';

const TeamMembersPanel = () => {
    const { teamId, team, members, isLead } = useTeam();
    const { isDemo } = useNexus();

    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [role, setRole] = useState('staff');
    const [rostered, setRostered] = useState(true);

    const [busy, setBusy] = useState(false);
    const [removingUid, setRemovingUid] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const sorted = useMemo(
        () => [...members].sort((a, b) => String(a.displayName || '').localeCompare(String(b.displayName || ''))),
        [members],
    );

    // The team's own lead count, which is what makes the "only lead" refusal
    // explainable BEFORE the server refuses it rather than only after.
    const leadCount = useMemo(() => members.filter((m) => m.role === 'lead').length, [members]);

    const reset = () => {
        setEmail('');
        setDisplayName('');
        setRole('staff');
        setRostered(true);
    };

    /**
     * The sandbox never writes. Checked before `teamId`, for the same reason as
     * everywhere else in the app: in demo mode the sandbox is the reason for the
     * refusal, and "no team selected" would be the wrong sentence for somebody who
     * has one.
     */
    const guard = () => {
        if (isDemo) {
            setError('SANDBOX MODE: the demo team is not a real team, so nobody can be added to it.');
            return false;
        }
        if (!teamId) {
            setError('You are not in a team, so there is no member list to change.');
            return false;
        }
        return true;
    };

    const handleAdd = async (event) => {
        event.preventDefault();
        setError('');
        setNotice('');
        if (!email.trim()) { setError('Which email address?'); return; }
        if (!guard()) return;

        setBusy(true);
        try {
            const result = await call('inviteMember')({
                teamId,
                email: email.trim(),
                displayName: displayName.trim(),
                role,
                rostered,
            });
            const data = result.data || {};
            if (!data.success) {
                // A refusal, not a fault — see `readError` above.
                setError(data.message || 'That person could not be added.');
                return;
            }
            setNotice(data.alreadyMember
                ? (data.message || 'They are already in this team.')
                : `${displayName.trim() || email.trim()} was added.`);
            reset();
        } catch (err) {
            setError(readError(err));
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = async (member) => {
        setError('');
        setNotice('');
        if (!guard()) return;

        setRemovingUid(member.uid);
        try {
            const result = await call('removeMember')({ teamId, uid: member.uid });
            const data = result.data || {};
            if (!data.success) {
                setError(data.message || 'That person could not be removed.');
                return;
            }
            setNotice(data.alreadyGone
                ? (data.message || 'They were already gone.')
                : `${member.displayName || 'That member'} was removed.`);
        } catch (err) {
            setError(readError(err));
        } finally {
            setRemovingUid('');
        }
    };

    /**
     * The reason a member cannot be removed, worked out HERE so the button explains
     * itself instead of looking broken. The server decides for real — this is the
     * same rule stated twice on purpose, and the two are pinned to each other by
     * `functions/teamMembership.test.js` holding the authoritative version.
     */
    const blockedReason = (member) => {
        if (team?.leadUid === member.uid) {
            return 'This is the lead the team was created for. The NEXUS owner transfers a team.';
        }
        if (member.role === 'lead' && leadCount <= 1) {
            return 'The only lead. Make somebody else a lead first.';
        }
        return null;
    };

    return (
        <div className="p-6 md:p-8 space-y-8">
            <header className="flex items-start gap-4">
                <div className="bg-indigo-500/10 p-3 rounded-xl h-fit"><Users className="text-indigo-500" size={22} /></div>
                <div>
                    <h2 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight">
                        {team?.name || 'Your team'}
                    </h2>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                        {members.length} {members.length === 1 ? 'person' : 'people'}
                        {team?.institution ? ` · ${team.institution}` : ''}
                    </p>
                </div>
            </header>

            {error && (
                <div role="alert" className="flex gap-3 p-4 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50">
                    <AlertCircle className="text-rose-500 shrink-0" size={18} />
                    <p className="text-xs font-medium text-rose-700 dark:text-rose-300 leading-relaxed">{error}</p>
                </div>
            )}
            {notice && (
                <div role="status" className="flex gap-3 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50">
                    <CheckCircle2 className="text-emerald-500 shrink-0" size={18} />
                    <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{notice}</p>
                </div>
            )}

            {isLead ? (
                <form onSubmit={handleAdd} className="p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 space-y-4">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-500">Add a colleague</h3>

                    {/*
                      * WHY THE ADDRESS AND NOT A PICKER. A lead knows their colleague's
                      * work email; nobody knows anybody's Firebase uid. The server
                      * resolves one to the other, which is also where it establishes
                      * that the account is real — a check no security rule can make.
                      */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Work email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="colleague@kkh.com.sg"
                                className="mt-1 w-full px-3 py-2.5 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-indigo-500"
                            />
                        </label>
                        <label className="block">
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Name (optional)</span>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="How the roster should show them"
                                className="mt-1 w-full px-3 py-2.5 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none focus:border-indigo-500"
                            />
                        </label>
                    </div>

                    <fieldset>
                        <legend className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Role</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            {ROLES.map(({ value, label, hint, Icon }) => (
                                <label
                                    key={value}
                                    className={`cursor-pointer p-3 rounded-xl border text-left transition-colors ${role === value
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
                                        : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                                >
                                    <input
                                        type="radio"
                                        name="member-role"
                                        value={value}
                                        checked={role === value}
                                        onChange={() => setRole(value)}
                                        className="sr-only"
                                    />
                                    <span className="flex items-center gap-2 text-xs font-black text-slate-800 dark:text-slate-100">
                                        <Icon size={14} /> {label}
                                    </span>
                                    <span className="block mt-1 text-[10px] text-slate-500 leading-snug">{hint}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {/*
                      * ⚠️ TWO QUESTIONS, NOT ONE. `role` says what somebody may DO;
                      * `rostered` says whether they hold clinical duties. A roster
                      * master is a lead with no duties; a small service's lead
                      * practises alongside everyone else. Neither can be inferred from
                      * the other, so the form asks. A VIEWER is never rostered and the
                      * server enforces that, so the control goes away rather than
                      * offering a choice that will be overruled.
                      */}
                    {role !== 'viewer' && (
                        <label className="flex items-start gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={rostered}
                                onChange={(e) => setRostered(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded accent-indigo-600"
                            />
                            <span className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                                <span className="font-bold">Include in the roster.</span>{' '}
                                Untick for somebody who runs the roster but does not work in it — a
                                roster master or a head of service.
                            </span>
                        </label>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full md:w-auto px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors"
                    >
                        {busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                        {busy ? 'Adding…' : 'Add to team'}
                    </button>

                    <p className="text-[10px] text-slate-400 leading-relaxed">
                        They need a NEXUS account first. Somebody who registers before you are ready
                        sees a waiting screen, not a broken app — add them here once they have.
                    </p>
                </form>
            ) : (
                <p className="text-xs text-slate-500 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-700">
                    Only a lead of this team can add or remove people. Ask yours.
                </p>
            )}

            <ul className="space-y-2">
                {sorted.map((member) => {
                    const blocked = blockedReason(member);
                    return (
                        <li
                            key={member.uid}
                            className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60"
                        >
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {member.displayName || member.email || member.uid}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-0.5">
                                    {member.role || 'staff'}
                                    {member.rostered === false ? ' · not rostered' : ''}
                                </p>
                                {/*
                                  * ⚠️ GRADE IS DELIBERATELY NOT HERE, AND IT WAS.
                                  *
                                  *    An earlier version printed "AH15 · principal"
                                  *    beside each name so a lead could spot a wrong
                                  *    self-set grade. It came out for two reasons.
                                  *    The smaller one is cost: grades are now separate
                                  *    documents, so rendering them here is one extra
                                  *    read per member on a screen that does not need
                                  *    them. The real one is that this component also
                                  *    renders read-only for a NON-lead — every rule
                                  *    that guards this data would still hold, but the
                                  *    component would be one prop away from showing a
                                  *    column it must never show.
                                  *
                                  *    A lead sees every grade in the Configure staff
                                  *    table, which is the moment a wrong one actually
                                  *    matters, and can correct it there.
                                  */}
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                                    {member.profession
                                        ? (professionLabel(member.profession) || member.profession)
                                        : <span className="italic text-slate-400">no profession set</span>}
                                </p>
                            </div>

                            {isLead && (
                                blocked ? (
                                    <span className="text-[10px] text-slate-400 max-w-[14rem] text-right leading-snug">{blocked}</span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => handleRemove(member)}
                                        disabled={removingUid === member.uid}
                                        aria-label={`Remove ${member.displayName || member.email || member.uid}`}
                                        className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50 transition-colors"
                                    >
                                        {removingUid === member.uid
                                            ? <Loader2 size={15} className="animate-spin" />
                                            : <Trash2 size={15} />}
                                    </button>
                                )
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default TeamMembersPanel;
