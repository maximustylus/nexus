import React, { useState, useRef } from 'react';
import { Camera, Save, Lock, LogOut, Shield, User, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

// FIREBASE IMPORTS
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

    // --- HANDLERS ---

    const handleAvatarClick = () => {
        fileInputRef.current.click();
    };

    const handleAvatarChange = async (e) => {
        const file = e.target.files[0];
        if (!file || !user?.uid) return;

        // Keep it under 5MB
        if (file.size > 5 * 1024 * 1024) {
            setProfileMessage({ type: 'error', text: 'Image must be less than 5MB.' });
            return;
        }

        setIsUploading(true);
        try {
            // Upload to our newly unlocked bucket!
            const storageRef = ref(storage, `avatars/${user.uid}_${Date.now()}`);
            const uploadTask = await uploadBytesResumable(storageRef, file);
            const downloadURL = await getDownloadURL(uploadTask.ref);

            // Update user document in Firestore
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
            // Scrub out any lingering Job Grades in parentheses (e.g., "Lead CEP (JG14)")
            const cleanRole = formData.role.replace(/\s*\(.*?\)/g, '').trim();

            await updateDoc(doc(db, 'users', user.uid), {
                name: formData.name,
                role: cleanRole,
                title: cleanRole, // Sync both just in case
                department: formData.department,
                bio: formData.bio
            });
            
            // Update local state to show the cleaned version
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
            // Firebase requires a "recent login" to change a password.
            if (error.code === 'auth/requires-recent-login') {
                setPasswordMessage({ type: 'error', text: 'For security, please sign out and sign back in to change your password.' });
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
                {/* Banner Background */}
                <div className="h-32 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 w-full relative">
                    <div className="absolute inset-0 bg-black/10"></div>
                </div>

                {/* Avatar Section */}
                <div className="px-6 pb-6 relative">
                    <div className="flex justify-between items-end -mt-12 mb-4">
                        <div className="relative group">
                            {/* The Profile Picture */}
                            <div className="w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 bg-indigo-100 flex items-center justify-center text-indigo-600 text-3xl font-black overflow-hidden shadow-md">
                                {isUploading ? (
                                    <Loader2 className="animate-spin text-indigo-600" size={32} />
                                ) : user?.photoURL ? (
                                    <img src={user.photoURL} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    user?.name?.charAt(0) || <User size={40} />
                                )}
                            </div>
                            
                            {/* Hidden File Input */}
                            <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/png, image/jpeg, image/webp" className="hidden" />
                            
                            {/* Camera Edit Overlay */}
                            <button onClick={handleAvatarClick} disabled={isUploading} className="absolute bottom-0 right-0 p-2 bg-slate-900 text-white rounded-full shadow-lg hover:bg-indigo-600 transition-colors z-10">
                                <Camera size={14} />
                            </button>
                        </div>

                        {/* Edit Profile Button */}
                        <button 
                            onClick={() => isEditing ? handleProfileSave() : setIsEditing(true)}
                            disabled={isSaving}
                            className={`px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-colors shadow-sm ${isEditing ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600'}`}
                        >
                            {isSaving ? <Loader2 size={16} className="animate-spin" /> : isEditing ? <><Save size={16}/> Save Changes</> : 'Edit Profile'}
                        </button>
                    </div>

                    {/* Quick Info Display */}
                    {!isEditing && (
                        <div>
                            <h1 className="text-2xl font-black text-slate-800 dark:text-white">{user?.name || 'Staff Member'}</h1>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-1 uppercase tracking-wider">{user?.title || user?.role || 'Clinical Staff'} • {user?.department || 'General Ward'}</p>
                            {user?.bio && <p className="mt-4 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{user.bio}</p>}
                        </div>
                    )}

                    {/* Profile Messages */}
                    {profileMessage && (
                        <div className={`mt-4 p-3 rounded-xl flex items-center gap-2 text-sm font-bold ${profileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                            {profileMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                            {profileMessage.text}
                        </div>
                    )}

                    {/* EDIT MODE FORM */}
                    {isEditing && (
                        <div className="space-y-4 mt-4 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Display Name</label>
                                    <input type="text" value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Department / Ward</label>
                                    <input type="text" value={formData.department} onChange={(e) => setFormData({...formData, department: e.target.value})} placeholder="e.g., Cardiology, Ward 44" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex justify-between">
                                    <span>Job Title / Role</span>
                                    <span className="text-indigo-500 normal-case font-medium">Do not include Job Grades (e.g. JG14)</span>
                                </label>
                                <input type="text" value={formData.role} onChange={(e) => setFormData({...formData, role: e.target.value})} placeholder="e.g., Lead Clinical Exercise Physiologist" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Short Bio / Status</label>
                                <textarea value={formData.bio} onChange={(e) => setFormData({...formData, bio: e.target.value})} placeholder="Working on the new wellness initiative..." className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-20" />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* --- SECURITY & SETTINGS CARD --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Change Password */}
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-amber-100 text-amber-600 rounded-lg"><Shield size={18} /></div>
                        <h2 className="font-bold text-slate-800 dark:text-white">Account Security</h2>
                    </div>
                    
                    <form onSubmit={handlePasswordUpdate} className="space-y-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">New Password</label>
                            <input 
                                type="password" 
                                value={newPassword} 
                                onChange={(e) => setNewPassword(e.target.value)} 
                                placeholder="Enter at least 6 characters" 
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-amber-500 outline-none" 
                            />
                        </div>
                        <button 
                            type="submit" 
                            disabled={isUpdatingPassword || !newPassword}
                            className="w-full bg-slate-800 hover:bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl px-4 py-2.5 text-sm font-bold transition-colors flex justify-center items-center gap-2"
                        >
                            {isUpdatingPassword ? <Loader2 size={16} className="animate-spin" /> : <><Lock size={14}/> Update Password</>}
                        </button>
                    </form>

                    {passwordMessage && (
                        <div className={`p-3 rounded-xl flex items-start gap-2 text-xs font-bold ${passwordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                            {passwordMessage.type === 'success' ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" /> : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
                            <p>{passwordMessage.text}</p>
                        </div>
                    )}
                </div>

                {/* Danger Zone / System */}
                <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between space-y-4">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-slate-100 text-slate-600 rounded-lg"><User size={18} /></div>
                            <h2 className="font-bold text-slate-800 dark:text-white">System Access</h2>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            Logged in securely to NEXUS Clinical Network. Ensure you sign out if you are using a shared terminal.
                        </p>
                    </div>
                    
                    <button 
                        onClick={handleSignOut}
                        className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl px-4 py-3 text-sm font-bold transition-colors flex justify-center items-center gap-2"
                    >
                        <LogOut size={16}/> Sign Out of NEXUS
                    </button>
                </div>
            </div>

            <div className="h-24" /> {/* Bottom Spacer for mobile nav */}
        </div>
    );
};

export default ProfileView;
