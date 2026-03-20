import React, { useState, useRef, useEffect } from 'react';
import { Camera, Save, Lock, LogOut, Shield, User, Loader2, AlertTriangle, CheckCircle2, Bell } from 'lucide-react';
import { auth, db, storage } from '../firebase';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updatePassword } from 'firebase/auth';
import ConfirmationModal from './ConfirmationModal'; 

const ProfileView = ({ user, onLogout }) => { 
    const [liveProfile, setLiveProfile] = useState(user);

    useEffect(() => {
        if (!user?.uid) return;
        const unsub = onSnapshot(doc(db, 'users', user.uid), (docSnap) => {
            if (docSnap.exists()) {
                setLiveProfile({ ...user, ...docSnap.data() });
            }
        });
        return () => unsub();
    }, [user?.uid]);

    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({});
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
            bio: liveProfile?.bio || ''
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
            await updateDoc(doc(db, 'users', user.uid), { photoURL: downloadURL });
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
        setIsSaving(true);
        try {
            const cleanRole = formData.role.replace(/\s*\(.*?\)/g, '').trim();
            await updateDoc(doc(db, 'users', user.uid), {
                name: formData.name,
                role: cleanRole,
                title: cleanRole,
                department: formData.department,
                bio: formData.bio
            });
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
        try { await updateDoc(doc(db, 'users', user.uid), { notificationsEnabled: newState }); } 
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
                            {liveProfile?.bio && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{liveProfile.bio}</p>}
                        </div>
                    ) : (
                        <div className="space-y-4 mt-4 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500 uppercase">Display Name</label><input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200" /></div>
                                <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500 uppercase">Department / Ward</label><input type="text" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200" /></div>
                            </div>
                            <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500 uppercase">Job Title / Role</label><input type="text" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none text-slate-800 dark:text-slate-200" /></div>
                            <div className="space-y-1.5"><label className="text-xs font-bold text-slate-500 uppercase">Bio / Status</label><textarea value={formData.bio} onChange={(e) => setFormData({...formData, bio: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none resize-none h-20 text-slate-800 dark:text-slate-200" /></div>
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

            {/* 🌟 CUSTOM SIGN OUT BUTTON */}
            <button 
                onClick={() => setIsSignOutModalOpen(true)} 
                className="w-full bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/10 dark:border-red-900/30 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors rounded-2xl px-4 py-4 text-sm font-bold flex justify-center items-center gap-2"
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
                        onLogout(); 
                    } else {
                        auth.signOut(); 
                    }
                }}
            />
        </div>
    );
};

export default ProfileView;
