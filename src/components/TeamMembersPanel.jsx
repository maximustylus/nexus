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

import React, { useState, useMemo, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { doc, updateDoc, setDoc } from 'firebase/firestore';
import {
    UserPlus, Trash2, Loader2, AlertCircle, CheckCircle2, Users, ShieldCheck, Eye, Stethoscope,
    Pencil, X, Lock, ShieldAlert,
} from 'lucide-react';
import { useTeam } from '../context/TeamContext';
import {
    GRADE_OPTIONS,
    professionLabel,
    buildMemberProfileUpdate,
    buildGradeUpdate,
    validateMemberProfile,
} from '../utils/memberProfile';
import { MOH_PROFESSION_OPTIONS } from '../data/mockData';
import { useMemberGrade } from '../hooks/useMemberGrade';
import { memberPath, gradePath } from '../utils/teamPaths';
import { db } from '../firebase';
import { useNexus } from '../context/NexusContext';
import { useDomainAllowlist } from '../hooks/useDomainAllowlist';

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
    // Is `config/domains` actually set up? Not the same question as "what are"
    // "the domains" — the hook always HAS a list, because it falls back so the
    // login screen keeps working. This asks whether the document yielded one,
    // because `inviteMember` on the server refuses everybody when it did not.
    const { configured: domainsConfigured, loaded: domainsLoaded } = useDomainAllowlist();

    const [email, setEmail] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [role, setRole] = useState('staff');
    const [rostered, setRostered] = useState(true);

    const [busy, setBusy] = useState(false);
    const [removingUid, setRemovingUid] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    /**
     * ── THE PER-MEMBER EDITOR ────────────────────────────────────────────────
     *
     * Which member is open, and the two draft values. `''` is closed, and closed
     * is what clears the grade out of this component's state — see the hook.
     */
    const [editingUid, setEditingUid] = useState('');
    const [draftProfession, setDraftProfession] = useState('');
    const [draftGrade, setDraftGrade] = useState('');
    /**
     * Whether a human has touched the grade select since this editor opened.
     *
     * ⚠️ THIS IS THE GUARD, AND `gradeLoading` ALONE WAS NOT ENOUGH. The first
     *    version seeded whenever the read finished and `loading` went false — which
     *    is precisely the moment a choice made DURING the read gets overwritten. The
     *    select is `disabled` while loading, so a browser would have hidden the
     *    defect and a test caught it; a disabled attribute is presentation and the
     *    next person to make the field editable-while-loading would have shipped a
     *    control that silently reverts what it was told.
     */
    const [gradeTouched, setGradeTouched] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);

    /**
     * ⚠️ ONE MEMBER'S GRADE, AND ONLY WHILE THEIR EDITOR IS OPEN.
     *
     *    `useTeamGrades` — the roster's hook — reads the whole department. Using it
     *    here would load every colleague's pay grade into a component that ALSO
     *    renders for a non-lead, which is one careless prop away from a screen that
     *    must never show a grade column. `editingUid` is `''` until a lead opens an
     *    editor, and the hook returns nothing until it is not.
     */
    const {
        grade: storedGrade,
        setBy: gradeSetBy,
        loading: gradeLoading,
        denied: gradeDenied,
    } = useMemberGrade(teamId, editingUid);

    /**
     * Seed the draft from the document once it lands.
     *
     * ⚠️ GUARDED ON BOTH `gradeLoading` AND `gradeTouched`, AND IT NEEDS BOTH. The
     *    hook starts at `grade: ''` before the read resolves, so an unguarded effect
     *    seeds `''` and then the real value lands. `gradeLoading` alone still loses
     *    a choice made while the read was in flight, because the overwrite happens
     *    at exactly the moment loading turns false.
     */
    useEffect(() => {
        if (!editingUid || gradeLoading || gradeTouched) return;
        setDraftGrade(storedGrade);
    }, [editingUid, gradeLoading, gradeTouched, storedGrade]);

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
     * ── OPEN, CLOSE, SAVE ────────────────────────────────────────────────────
     *
     * `firestore.rules` has permitted this since grades were split out —
     * `allow create, update: if isSelf(memberUid) || isLead(teamId)` on the grade
     * document, and `profession` sits in the lead's membership allowlist. What did
     * not exist was anywhere to do it. A grade could only ever be set by the person
     * themselves, so a department could not roster until every member had been
     * chased for one, and a wrong grade — which decides who leads a shift — could
     * not be corrected by anybody.
     */
    const openEditor = (member) => {
        setError('');
        setNotice('');
        setDraftProfession(member.profession || '');
        setDraftGrade('');
        setGradeTouched(false);
        setEditingUid(member.uid);
    };

    const closeEditor = () => {
        setEditingUid('');
        setDraftProfession('');
        setDraftGrade('');
        setGradeTouched(false);
    };

    const handleSaveMember = async (member) => {
        setError('');
        setNotice('');
        if (!guard()) return;

        const complaint = validateMemberProfile({ grade: draftGrade, profession: draftProfession });
        if (complaint) { setError(complaint); return; }

        /**
         * ⚠️ A REFUSED READ IS A REFUSAL TO WRITE. `gradeDenied` means this caller
         *    could not read the grade — so `storedGrade` is `''` for a reason that
         *    has nothing to do with the person's grade, and saving would write the
         *    draft over a value never seen. The rules would refuse the write anyway;
         *    this is the sentence that explains it instead of `permission-denied`.
         */
        if (gradeDenied) {
            setError('Their grade could not be read, so it cannot be changed from here. '
                + 'Only a lead of this team can set somebody else\'s grade.');
            return;
        }

        const memberUpdate = buildMemberProfileUpdate({ profession: draftProfession }, member);
        /**
         * `setBy: 'lead'` whenever this screen writes — including when a lead edits
         * their OWN row, which is true and harmless. What it is NOT is a log of WHO:
         * the grade document deliberately carries no history, and a named record of
         * who changed a colleague's pay grade is a second sensitive artefact.
         */
        const gradeUpdate = buildGradeUpdate(draftGrade, storedGrade, new Date().toISOString(), 'lead');

        if (!memberUpdate && !gradeUpdate) { closeEditor(); return; }

        setSavingEdit(true);
        try {
            /**
             * ⚠️ TWO DOCUMENTS, AND THE GRADE ONE IS `setDoc` RATHER THAN
             *    `updateDoc`. The membership always exists — a Cloud Function
             *    created it — but the grade document does not exist until somebody
             *    first chooses a grade, and `updateDoc` on a missing document fails.
             */
            if (memberUpdate) {
                await updateDoc(doc(db, ...memberPath(teamId, member.uid)), memberUpdate);
            }
            if (gradeUpdate) {
                await setDoc(doc(db, ...gradePath(teamId, member.uid)), gradeUpdate, { merge: true });
            }
            setNotice(`${member.displayName || member.email || 'That member'} was updated.`);
            closeEditor();
        } catch (err) {
            setError(readError(err));
        } finally {
            setSavingEdit(false);
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

            {/*
              * ⚠️ SAID BEFORE THEY PRESS ADD, NOT AFTER IT FAILS.
              *
              * `config/domains` is what tells the server which institutions NEXUS
              * serves, and until that document exists `inviteMember` refuses EVERY
              * address — correctly, because a gate that opens when its configuration
              * is missing is not a gate. But nothing said so, so the first a lead knew
              * was a refusal naming their own hospital, which reads as "your
              * institution is not welcome here". It is not: it is a setup step nobody
              * has done. The owner hit this on 2026-08-31 on `kkh.com.sg`.
              *
              * WHY HERE AND NOT ON THE LOGIN SCREEN: the hook's own header argues that
              * a red banner on the login screen of a clinical tool costs more than it
              * buys, and that is still right — a visitor can do nothing about it and
              * the fallback lets them in anyway. A lead standing in front of the Add
              * form is the opposite case: they are about to take an action that will
              * fail, and they are usually the person who can get it fixed.
              *
              * `domainsLoaded` gates it so the notice does not flash while the read is
              * in flight, which would train people to ignore it.
              */}
            {isLead && domainsLoaded && !domainsConfigured && (
                /* `role="note"`, not `status`: this is persistent, rendered on mount, and
                   a live region announces CHANGES — it would also collide with the
                   transient status banner above, which tests address by that role. */
                <div role="note" className="flex gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
                    <ShieldAlert className="text-amber-500 shrink-0" size={18} />
                    <div className="text-xs font-medium text-amber-800 dark:text-amber-300 leading-relaxed space-y-1">
                        <p>
                            <span className="font-black">NEXUS has no registered organisations yet, so adding
                            anybody will be refused</span> — whatever their address. This is a one-off setup step,
                            not a judgement about your institution.
                        </p>
                        <p>
                            Whoever installed NEXUS needs to register your organisation&apos;s email domain. Until
                            then colleagues can still create accounts, but they cannot be added to a team.
                        </p>
                    </div>
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
                    const isOpen = editingUid === member.uid;
                    return (
                        <li
                            key={member.uid}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60"
                        >
                            <div className="flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                                    {member.displayName || member.email || member.uid}
                                </p>
                                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black mt-0.5">
                                    {member.role || 'staff'}
                                    {member.rostered === false ? ' · not rostered' : ''}
                                </p>
                                {/*
                                  * ⚠️ GRADE IS DELIBERATELY NOT IN THIS ROW, AND IT WAS.
                                  *
                                  *    An earlier version printed "AH15 · principal"
                                  *    beside each name so a lead could spot a wrong
                                  *    self-set grade. It came out for two reasons.
                                  *    The smaller one is cost: grades are separate
                                  *    documents, so rendering them here is one extra
                                  *    read per member on a screen that does not need
                                  *    them. The real one is that this component also
                                  *    renders read-only for a NON-lead — every rule
                                  *    that guards this data would still hold, but the
                                  *    component would be one prop away from showing a
                                  *    column it must never show.
                                  *
                                  *    ⚠️ THIS COMMENT USED TO END "a lead sees every
                                  *    grade in the Configure staff table and can
                                  *    correct it there". A lead does SEE them, but
                                  *    those rows are derived and read-only, so there
                                  *    was no correction path anywhere in the app.
                                  *    There is one now — the editor below — and it is
                                  *    inside `isLead && isOpen`, so a grade still
                                  *    never reaches the list a non-lead renders.
                                  */}
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                                    {member.profession
                                        ? (professionLabel(member.profession) || member.profession)
                                        : <span className="italic text-slate-400">no profession set</span>}
                                </p>
                            </div>

                            {isLead && (
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => (isOpen ? closeEditor() : openEditor(member))}
                                        aria-label={`Edit profession and grade for ${member.displayName || member.email || member.uid}`}
                                        aria-expanded={isOpen}
                                        className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                    >
                                        {isOpen ? <X size={15} /> : <Pencil size={15} />}
                                    </button>

                                    {blocked ? (
                                        <span className="text-[10px] text-slate-400 max-w-[12rem] text-right leading-snug">{blocked}</span>
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
                                    )}
                                </div>
                            )}
                            </div>

                            {/* ── THE EDITOR ──────────────────────────────────────
                              *
                              * Rendered ONLY inside `isLead && isOpen`, and that is
                              * the placement rather than a style choice: it is the
                              * only branch of this component a grade appears in, so
                              * the list itself can never grow a grade column by
                              * somebody adding a field to the row above.
                              */}
                            {isLead && isOpen && (
                                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <label htmlFor={`member-profession-${member.uid}`} className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                                Profession
                                            </label>
                                            <select
                                                id={`member-profession-${member.uid}`}
                                                value={draftProfession}
                                                onChange={(e) => setDraftProfession(e.target.value)}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm outline-none text-slate-800 dark:text-slate-200"
                                            >
                                                <option value="">Not set</option>
                                                {MOH_PROFESSION_OPTIONS.map((entry) => (entry.kind === 'group' ? (
                                                    <optgroup key={entry.groupId} label={entry.label}>
                                                        {entry.options.map((leaf) => (
                                                            <option key={leaf.id} value={leaf.id}>{leaf.name}</option>
                                                        ))}
                                                    </optgroup>
                                                ) : (
                                                    <option key={entry.id} value={entry.id}>{entry.name}</option>
                                                )))}
                                            </select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <label htmlFor={`member-grade-${member.uid}`} className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                                                <Lock size={10} /> Job grade
                                            </label>
                                            <select
                                                id={`member-grade-${member.uid}`}
                                                value={draftGrade}
                                                disabled={gradeLoading || gradeDenied}
                                                onChange={(e) => { setGradeTouched(true); setDraftGrade(e.target.value); }}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm outline-none text-slate-800 dark:text-slate-200 disabled:opacity-50"
                                            >
                                                <option value="">{gradeLoading ? 'Reading…' : 'Not set'}</option>
                                                {GRADE_OPTIONS.map((grade) => (
                                                    <option key={grade} value={grade}>{grade}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {gradeDenied ? (
                                        <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed">
                                            Their grade could not be read. Only a lead of this team can see or set
                                            somebody else&apos;s grade.
                                        </p>
                                    ) : (
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                                            {/* ⚠️ NO BAND NAME AND NO "leads shifts" SENTENCE HERE, unlike the
                                                person's own profile screen. `describeGrade` needs the team's
                                                band boundaries, this panel does not read the roster settings,
                                                and a department can move its senior line — so naming a band
                                                from the defaults would be confidently wrong on exactly the
                                                team that had changed it. The boundary is named where it is
                                                actually set instead. */}
                                            <span className="font-bold">Only you and they can see this.</span>{' '}
                                            Grade decides which shifts the roster will let them lead — where this
                                            department draws its senior line is set in Configure.
                                            {gradeSetBy === 'lead' && ' This grade was last set by a lead, not by them.'}
                                        </p>
                                    )}

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleSaveMember(member)}
                                            disabled={savingEdit || gradeLoading}
                                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-colors"
                                        >
                                            {savingEdit && <Loader2 size={13} className="animate-spin" />}
                                            {savingEdit ? 'Saving…' : 'Save'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={closeEditor}
                                            className="px-4 py-2 rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 text-[10px] font-black uppercase tracking-widest transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default TeamMembersPanel;
