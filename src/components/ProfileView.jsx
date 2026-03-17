import React, { useState, useRef } from 'react';
import { Camera, Save, Lock, LogOut, Shield, User, Loader2, AlertTriangle, CheckCircle2, Bell } from 'lucide-react';
import { auth, db, storage } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { updatePassword } from 'firebase/auth';

const ProfileView = ({ user }) => {
    // 1. PROFILE STATE
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: user?.name || '',
        role: user?.title || user?.role || '',
        department: user?.department || '',
        bio: user?.bio || ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState(null);

    // 2. AVATAR UPLOAD STATE
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef(null);

    // 3. SECURITY STATE
    const [newPassword, setNewPassword] = useState('');
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState(null);

    // 4. PREFERENCES STATE (🌟 Added for functional toggle)
    const [pushEnabled, setPushEnabled] = useState(true);

    // --- HANDLERS ---

    const handleAvatarClick = () => {
        fileInputRef.current.click();
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file || !user?.uid) return;

        if (file.size > 5 * 1024 * 1024) {
            setProfileMessage({ type: 'error', text: 'Image must be less than 5MB.' });
            return;
        }

        setIsUploading(true);
        try {
            const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`);
            const uploadTask = await uploadBytesResumable(storageRef, file);
            const downloadURL = await getDownloadURL(uploadTask.ref);

            await updateDoc(doc(db, 'users', user.uid), {
                photoURL: downloadURL
            });

            setProfileMessage({ type: 'success', text: 'Profile picture updated successfully!' });
        } catch (error) {
            console.error("Upload error:", error);
            setProfileMessage({ type: 'error', text: 'Failed to upload image. Try again.' });
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
            
            setFormData(prev => ({ ...prev, role: cleanRole }));
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
        if (!newPassword || newPassword.length < 6) {
            setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters.' });
            return;
        }

        setIsUpdatingPassword(true);
        try {
            const currentUser = auth.currentUser;
            if (currentUser) {
                await updatePassword(currentUser, newPassword);
                setPasswordMessage({ type: 'success', text: 'Password updated successfully!' });
                setNewPassword('');
            }
        } catch (error) {
            if (error.code === 'auth/requires-recent-login') {
                setPasswordMessage({ type: 'error', text: 'Please sign out and back in to change password.' });
            } else {
                setPasswordMessage({ type: 'error', text: error.message });
            }
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const handleSignOut = () => {
        if (window.confirm("Are you sure you want to sign out?")) {
            auth.signOut();
        }
    };

    return (
        <div className="w-full max-w-[800px] mx-auto p-4 md:p-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* --- HEADER BANNER & AVATAR --- */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm border border-slate-200 dark:border-slate-700">
                <div className="h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 w-full relative">
                    <div className="absolute inset-0 bg-black/10"></div>
                </div>

                <div className="px-6 pb-6 relative">
                    <div className="flex justify-between items-end -mt-12 mb-4">
                        <div className="relative group">
                            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 bg-indigo-100 flex items-center justify-center text-indigo-600 text-3xl font-black overflow-hidden shadow-md">
                                {isUploading ? (
                                    <Loader2 className="animate-spin text-indigo-600" size={32} />
                                ) : user?.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    user?.name?.charAt(0) || <User size={40} />
                                )}
                            </div>
                            <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/png, image/jpeg, image/webp" className="hidden" />
                            <button onClick={handleAvatarClick} disabled={isUploading} className="absolute bottom-0 right-0 p-2 bg-slate-900 text-white rounded-full shadow-lg hover:bg-indigo-600 transition-colors z-10">
                                <Camera size={14} />
                            </button>
                        </div>

                        <button 
                            onClick={() => isEditing ? handleProfileSave() : setIsEditing(true)}
                            disabled={isSaving}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm ${isEditing ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'}`}
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : isEditing ? <><Save size={16}/> Save Changes</> : 'Edit Profile'}
                        </button>
                    </div>

                    {!isEditing ? (
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 dark:text-white">{user?.name || 'Staff Member'}</h1>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{user?.title || user?.role || 'Clinical Staff'} • {user?.department || 'General Ward'}</p>
                            {user?.bio && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{user.bio}</p>}
                        </div>
                    ) : (
                        <div className="space-y-4 mt-4 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Display Name</label>
                                    <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department / Ward</label>
                                    <input type="text" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} placeholder="e.g., Ward 44" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Job Title / Role</label>
                                <input type="text" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- SECURITY & PREFERENCES --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Shield size={18} /></div>
                        <h2 className="font-bold text-slate-800 dark:text-white">Account Security</h2>
                    </div>
                    <form onSubmit={handlePasswordUpdate} className="space-y-3">
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New Password" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none" />
                        <button type="submit" disabled={isUpdatingPassword || !newPassword} className="w-full bg-slate-800 text-white rounded-xl px-4 py-2.5 text-sm font-bold flex justify-center items-center gap-2">
                            {isUpdatingPassword ? <Loader2 size={16} className="animate-spin" /> : <><Lock size={14}/> Update Password</>}
                        </button>
                    </form>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Bell size={18} /></div>
                        <h2 className="font-bold text-slate-800 dark:text-white">Preferences</h2>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                        <div>
                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Notifications</p>
                            <p className="text-[10px] text-slate-500">Enable post alerts</p>
                        </div>
                        <button 
                            onClick={() => setPushEnabled(!pushEnabled)}
                            className={`w-10 h-5 rounded-full relative flex items-center px-1 transition-colors duration-200 ${pushEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <div className={`w-3 h-3 bg-white rounded-full transition-transform duration-200 ${pushEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>
                </div>
            </div>

            <button onClick={handleSignOut} className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-2xl px-4 py-4 text-sm font-bold transition-colors flex justify-center items-center gap-2">
                <LogOut size={16}/> Sign Out of NEXUS
            </button>

            <div className="h-24" />
        </div>
    );
};

export default ProfileView;
