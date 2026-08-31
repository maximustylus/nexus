import React, { useState, useRef, useEffect } from 'react';
import { Camera, Save, Lock, LogOut, Shield, User, Loader2, AlertTriangle, CheckCircle2, Bell } from 'lucide-react';
import { auth, db, storage } from '../firebase';
import { doc, updateDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { userPath, memberPath, gradePath } from '../utils/teamPaths';
import { useTeam } from '../context/TeamContext';
import { MOH_PROFESSION_OPTIONS } from '../data/mockData';
import {
    GRADE_OPTIONS,
    describeGrade,
    professionLabel,
    buildMemberProfileUpdate,
    buildGradeUpdate,
    validateMemberProfile,
} from '../utils/memberProfile';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updatePassword } from 'firebase/auth';

// 🌟 IMPORT THE CUSTOM MODAL
import ConfirmationModal from './ConfirmationModal'; 

const ProfileView = ({ user, onLogout }) => {
    /**
     * ⚠️ TWO DOCUMENTS, AND THE SPLIT IS FORCED BY A RULE RATHER THAN CHOSEN.
     *
     * `users/{uid}` is `allow get: if isSelf(userId)` — only you can read your own.
     * So grade and profession, which a colleague and the roster engine both have to
     * see, cannot live there: Nisa opening Configure would get permission-denied on
     * every member. They live on `teams/{teamId}/members/{uid}`, which the team can
     * read. See `src/utils/memberProfile.js` for the full reasoning.
     *
     * The visible consequence is that this screen saves to two places, and the
     * member half is skipped entirely when there is no team — somebody on the
     * holding screen still has a name, a bio and a password to change.
     */
    const { teamId, membership, team } = useTeam();

    // 🌟 DIRECT DB CONNECTION: Ensures Profile always shows what is ACTUALLY in the database
    const [liveProfile, setLiveProfile] = useState(user);

    /**
     * ⚠️ THE GRADE IS FETCHED SEPARATELY BECAUSE IT IS A SEPARATE DOCUMENT, and it
     *    is a separate document because rules cannot hide a field. `TeamContext`
     *    holds the membership and deliberately does NOT hold this — a context every
     *    screen reads is the wrong place for the one value the team may not see.
     *
     *    Reading your own is always permitted (`isSelf`), so this listener needs no
     *    role check. It simply has nothing to read until somebody sets a grade.
     */
    const [myGrade, setMyGrade] = useState('');

    useEffect(() => {
        if (!user?.uid) return;
        const unsub = onSnapshot(doc(db, ...userPath(user.uid)), (docSnap) => {
            if (docSnap.exists()) {
                setLiveProfile({ ...user, ...docSnap.data() });
            }
        });
        return () => unsub();
        // Deliberately keyed on the uid alone: re-subscribing whenever the `user`
        // object's identity changes would tear down and rebuild the Firestore
        // listener on every parent render. The cost is that the `...user` spread
        // above can be one render stale. Left for follow-up: spread from a ref or
        // merge in a functional update, then list `user`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid]);

    useEffect(() => {
        if (!user?.uid || !teamId) { setMyGrade(''); return undefined; }
        const unsub = onSnapshot(
            doc(db, ...gradePath(teamId, user.uid)),
            (snap) => setMyGrade(snap.exists() ? (snap.data().grade || '') : ''),
            // A denial here is not an error worth surfacing: it means the person is
            // no longer in the team, which every other screen is already saying.
            () => setMyGrade(''),
        );
        return () => unsub();
    }, [user?.uid, teamId]);

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({});

    /**
     * The stored grade, and the one currently selected in the form — two different
     * questions, so two values. The chip above the form describes what is SAVED;
     * the sentence under the dropdown describes what is about to be saved, which is
     * the only version that can warn somebody before they commit to it.
     *
     * Bands come from the team's own configuration when it has one: a department can
     * move the junior/senior boundary, and describing AH12 as junior while that
     * team's engine treats it as senior would be confidently wrong.
     */
    const gradeDetail = describeGrade(myGrade, team?.rosterBands);
    const draftGrade = describeGrade(formData.grade || '', team?.rosterBands);
    const [isSaving, setIsSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState(null);

    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    const [newPassword, setNewPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState(null);

    const [pushEnabled, setPushEnabled] = useState(liveProfile?.notificationsEnabled ?? true);
    
    // 🌟 STATE: Controls if the custom sign-out modal is open
    const [isSignOutModalOpen, setIsSignOutModalOpen] = useState(false);

    const startEditing = () => {
        setFormData({
            name: liveProfile?.name || '',
            role: liveProfile?.role || liveProfile?.title || '',
            department: liveProfile?.department || '',
            bio: liveProfile?.bio || '',
            // From the MEMBERSHIP, not the profile — see the note at the top.
            grade: myGrade,
            profession: membership?.profession || '',
        });
        setIsEditing(true);
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file || !user?.uid) return;
        setIsUploading(true);
        try {
            const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`);
            const uploadTask = await uploadBytesResumable(storageRef, file);
            const downloadURL = await getDownloadURL(uploadTask.ref);
            await updateDoc(doc(db, ...userPath(user.uid)), { photoURL: downloadURL });
            setProfileMessage({ type: 'success', text: 'Profile picture updated!' });
        } catch (error) {
            setProfileMessage({ type: 'error', text: 'Failed to upload image.' });
        } finally {
            setIsUploading(false);
            setTimeout(() => setProfileMessage(null), 3000);
        }
    };

    const handleProfileSave = async () => {
        if (!user?.uid) return;

        /**
         * Checked HERE rather than left to Firestore, because the rule that would
         * catch it — `changedKeys().hasOnly([...])` — fails the whole write with
         * `permission-denied`. That is a true error message and a useless one: it
         * reads to a clinician as though their account is broken, when in fact a
         * dropdown holds a value the scale does not have.
         */
        const invalid = validateMemberProfile(formData);
        if (invalid) {
            setProfileMessage({ type: 'error', text: invalid });
            setTimeout(() => setProfileMessage(null), 5000);
            return;
        }

        setIsSaving(true);
        try {
            const cleanRole = formData.role.replace(/\s*\(.*?\)/g, '').trim();
            await updateDoc(doc(db, ...userPath(user.uid)), {
                name: formData.name,
                role: cleanRole,
                title: cleanRole,
                department: formData.department,
                bio: formData.bio
            });

            /**
             * ⚠️ SECOND, AND ONLY IF SOMETHING CHANGED. `buildMemberProfileUpdate`
             *    returns null when both fields are untouched, which is the common
             *    case — most saves are a bio edit — and skipping the write saves a
             *    round trip rather than spending one to confirm two strings are
             *    still equal.
             *
             * ⚠️ AND IT IS NOT IN THE SAME try AS A BATCH. These are two documents
             *    under two different rules, and they cannot be written atomically
             *    from a client. If the membership write fails while the profile
             *    write succeeded, the honest report is "your name saved, your grade
             *    did not" — not a blanket failure that makes somebody retype a bio
             *    that is already stored.
             */
            const memberUpdate = teamId ? buildMemberProfileUpdate(formData, membership || {}) : null;
            /**
             * ⚠️ `setBy: 'self'` IS NOT COSMETIC — IT CLEARS A STALE 'lead'. A lead
             *    can set somebody's grade from the TEAM tab, which stamps
             *    `setBy: 'lead'` so that person can be told a grade they never chose
             *    is deciding which shifts they lead. If this write did not stamp
             *    `'self'`, correcting it here would leave the field saying a lead had
             *    set it — the screen would keep contradicting what the person had
             *    just done, and `merge: true` means an omitted field is KEPT, not
             *    cleared.
             */
            const gradeUpdate = teamId
                ? buildGradeUpdate(formData.grade, myGrade, new Date().toISOString(), 'self')
                : null;

            if (memberUpdate || gradeUpdate) {
                try {
                    /**
                     * ⚠️ TWO DIFFERENT WRITES, AND THE GRADE ONE IS `setDoc` RATHER
                     *    THAN `updateDoc`. The membership already exists — it was
                     *    created by `approveLeadRequest` or `inviteMember` — so an
                     *    update is right. The grade document does NOT exist until
                     *    somebody first chooses a grade, and `updateDoc` on a missing
                     *    document fails with `not-found`, which would make the very
                     *    first grade anybody sets the one that cannot be saved.
                     */
                    if (memberUpdate) {
                        await updateDoc(doc(db, ...memberPath(teamId, user.uid)), memberUpdate);
                    }
                    if (gradeUpdate) {
                        await setDoc(doc(db, ...gradePath(teamId, user.uid)), gradeUpdate, { merge: true });
                    }
                } catch (memberError) {
                    setIsEditing(false);
                    setProfileMessage({
                        type: 'error',
                        text: 'Your name, department and bio were saved. Your grade and profession '
                            + 'were not — they are stored with your team, and that write was refused. '
                            + 'Ask your team lead to set them for you.',
                    });
                    setTimeout(() => setProfileMessage(null), 8000);
                    return;
                }
            }

            setIsEditing(false);
            setProfileMessage({ type: 'success', text: 'Profile updated successfully!' });
        } catch (error) {
            setProfileMessage({ type: 'error', text: 'Failed to update profile.' });
        } finally {
            setIsSaving(false);
            setTimeout(() => setProfileMessage(null), 3000);
        }
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        if (!newPassword || newPassword.length < 6) return;
        setIsUpdatingPassword(true);
        try {
            if (auth.currentUser) {
                await updatePassword(auth.currentUser, newPassword);
                setPasswordMessage({ type: 'success', text: 'Password updated!' });
                setNewPassword('');
            }
        } catch (error) {
            setPasswordMessage({ type: 'error', text: 'Please sign out and back in to change password.' });
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const handleToggleNotifications = async () => {
        if (!user?.uid) return;
        const newState = !pushEnabled;
        setPushEnabled(newState);
        try { await updateDoc(doc(db, ...userPath(user.uid)), { notificationsEnabled: newState }); } 
        catch (error) { setPushEnabled(!newState); }
    };

    return (
        <div className="w-full max-w-[800px] mx-auto p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 w-full relative">
                    <div className="absolute inset-0 bg-black/10"></div>
                </div>

                <div className="px-6 pb-6 relative">
                    <div className="flex justify-between items-end -mt-12 mb-4">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 bg-indigo-100 flex items-center justify-center text-indigo-600 text-3xl font-black overflow-hidden shadow-md">
                                {isUploading ? <Loader2 className="animate-spin text-indigo-600" size={32} /> 
                                : liveProfile?.photoURL ? <img src={liveProfile.photoURL} alt="Profile" className="w-full h-full object-cover" /> 
                                : <span className="uppercase">{liveProfile?.name?.charAt(0) || <User size={40} />}</span>}
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/png, image/jpeg, image/webp" className="hidden" />
                            <button onClick={() => fileInputRef.current.click()} disabled={isUploading} className="absolute bottom-0 right-0 p-2 bg-slate-900 text-white rounded-full shadow-lg hover:bg-indigo-600 z-10"><Camera size={14} /></button>
                        </div>

                        <button onClick={() => isEditing ? handleProfileSave() : startEditing()} disabled={isSaving} className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm ${isEditing ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200'}`}>
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : isEditing ? <><Save size={16}/> Save Changes</> : 'Edit Profile'}
                        </button>
                    </div>

                    {!isEditing ? (
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 dark:text-white">{liveProfile?.name || 'Staff Member'}</h1>
                            <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-wider">{liveProfile?.role || 'Clinical Staff'} • {liveProfile?.department || 'General Ward'}</p>
                            {/* Grade and profession read out of the MEMBERSHIP, and only when
                                there is one. Somebody on the holding screen has no team, so
                                there is nothing true to print here — an empty chip saying
                                "no grade" would suggest a field they had failed to fill in. */}
                            {teamId && (myGrade || membership?.profession) && (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    {/* Your own grade, on your own profile. Nobody else can
                                        reach this screen for you, and nobody else can read the
                                        document behind it. */}
                                    {myGrade && (
                                        <span className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[11px] font-black tracking-wide">
                                            {myGrade}
                                            {gradeDetail.band ? ` · ${gradeDetail.band}` : ''}
                                        </span>
                                    )}
                                    {membership?.profession && (
                                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[11px] font-bold">
                                            {professionLabel(membership.profession) || membership.profession}
                                        </span>
                                    )}
                                    {team?.name && (
                                        <span className="text-[11px] font-bold text-slate-400">in {team.name}</span>
                                    )}
                                </div>
                            )}
                            {liveProfile?.bio && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{liveProfile.bio}</p>}
                        </div>
                    ) : (
                        <div className="space-y-4 mt-4 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5"><label htmlFor="profile-name" className="text-xs font-bold text-slate-500 uppercase">Display Name</label><input id="profile-name" type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200" /></div>
                                <div className="space-y-1.5"><label htmlFor="profile-department" className="text-xs font-bold text-slate-500 uppercase">Department / Ward</label><input id="profile-department" type="text" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200" /></div>
                            </div>
                            <div className="space-y-1.5"><label htmlFor="profile-role" className="text-xs font-bold text-slate-500 uppercase">Job Title / Role</label><input id="profile-role" type="text" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200" /></div>
                            {/* ── PROFESSION AND GRADE ────────────────────────────────
                                These two save to the TEAM MEMBERSHIP, not to this profile,
                                because only you can read your own `users/{uid}` document and
                                the roster has to read everybody's. Rendered only when there
                                IS a team: a person on the holding screen would otherwise be
                                offered two controls whose save is guaranteed to be skipped.
                                ─────────────────────────────────────────────────────────── */}
                            {teamId && (
                                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-4 bg-slate-50/60 dark:bg-slate-900/40">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Your team {team?.name ? `· ${team.name}` : ''}
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label htmlFor="profile-profession" className="text-xs font-bold text-slate-500 uppercase">Profession</label>
                                            <select
                                                id="profile-profession"
                                                value={formData.profession}
                                                onChange={(e) => setFormData({ ...formData, profession: e.target.value })}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200"
                                            >
                                                <option value="">Not set</option>
                                                {/* The same grouped list the lead declaration uses, so a
                                                    profession added to `mohAlliedHealth.js` appears in both
                                                    without either screen being edited. */}
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
                                            <label htmlFor="profile-grade" className="text-xs font-bold text-slate-500 uppercase">Job Grade</label>
                                            <select
                                                id="profile-grade"
                                                value={formData.grade}
                                                onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200"
                                            >
                                                <option value="">Not set</option>
                                                {GRADE_OPTIONS.map((grade) => (
                                                    <option key={grade} value={grade}>{grade}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {/* ⚠️ WHAT THE CHOICE ACTUALLY DOES, BESIDE THE CONTROL THAT
                                        MAKES IT. Grade is self-set here by the owner's decision,
                                        and nothing reviews it — so the honest mitigation is that
                                        somebody selecting a principal grade reads "leads shifts"
                                        at the moment they select it, rather than discovering it
                                        from a roster three weeks later. */}
                                    {draftGrade.consequence && (
                                        <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-relaxed">
                                            <span className="font-black text-slate-700 dark:text-slate-200">{draftGrade.grade}</span>
                                            {draftGrade.band ? ` is ${draftGrade.band}. ` : '. '}
                                            {draftGrade.consequence} Only you and your team lead can see this.
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="space-y-1.5"><label htmlFor="profile-bio" className="text-xs font-bold text-slate-500 uppercase">Bio / Status</label><textarea id="profile-bio" value={formData.bio} onChange={(e) => setFormData({...formData, bio: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none resize-none h-20 text-slate-800 dark:text-slate-200" /></div>
                        </div>
                    )}

                    {profileMessage && (
                        <div className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm font-bold ${profileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400'}`}>
                            {profileMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {profileMessage.text}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                    <div className="flex items-center gap-2 mb-2"><div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Shield size={18} /></div><h2 className="font-bold text-slate-800 dark:text-white">Account Security</h2></div>
                    <form onSubmit={handlePasswordUpdate} className="space-y-3">
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New Password" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200" />
                        <button type="submit" disabled={isUpdatingPassword || !newPassword} className="w-full bg-slate-800 dark:bg-indigo-600 text-white hover:bg-slate-900 dark:hover:bg-indigo-700 transition-colors rounded-xl px-4 py-2.5 text-sm font-bold flex justify-center items-center gap-2"><Lock size={14}/> Update Password</button>
                    </form>
                    {passwordMessage && (
                        <div className={`mt-2 p-2 rounded-lg flex items-center gap-2 text-xs font-bold ${passwordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {passwordMessage.text}
                        </div>
                    )}
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                    <div className="flex items-center gap-2 mb-2"><div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Bell size={18} /></div><h2 className="font-bold text-slate-800 dark:text-white">Preferences</h2></div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                        <div><p className="text-sm font-bold text-slate-700 dark:text-slate-200">Notifications</p><p className="text-[10px] text-slate-500">Enable post alerts</p></div>
                        <button onClick={handleToggleNotifications} className={`w-10 h-5 rounded-full relative flex items-center px-1 transition-colors ${pushEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                            <div className={`w-3 h-3 bg-white rounded-full transition-transform ${pushEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* 🌟 CUSTOM SIGN OUT BUTTON (Fixed Dark Mode Contrast) */}
            <button 
                onClick={() => setIsSignOutModalOpen(true)} 
                className="w-full bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors rounded-2xl px-4 py-4 text-sm font-bold flex justify-center items-center gap-2"
            >
                <LogOut size={16}/> Sign Out of NEXUS
            </button>
            <div className="h-24" />

            {/* 🌟 CUSTOM SIGN OUT MODAL */}
            <ConfirmationModal 
                isOpen={isSignOutModalOpen}
                title="NEXUS says"
                message="Sign out?"
                onCancel={() => setIsSignOutModalOpen(false)}
                onConfirm={() => {
                    setIsSignOutModalOpen(false);
                    if (onLogout) {
                        onLogout(); // Calls the secure hard flush from App.jsx
                    } else {
                        auth.signOut(); // Fallback
                    }
                }}
            />
        </div>
    );
};

export default ProfileView;
