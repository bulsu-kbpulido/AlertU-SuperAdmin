import { useState, useEffect, useMemo } from 'react';
import {
  User, Eye, EyeOff, CheckCircle2, Loader2, UploadCloud,
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { isValidPhoneNumber } from 'react-phone-number-input';
import PhoneInputField from '../components/PhoneInputField';
import { db, auth } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { resolveSuperAdminDocId } from '../utils/superAdminDoc';
import { useAuditLog } from '../useAuditLog';
import { fetchFromBackend } from '../api';
import { PasswordStrengthInput, DEFAULT_RULES } from '@/components/spectrumui/password-strength';
import {
  updatePassword,
  updateEmail,
  updateProfile,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BADGE_VARIANTS = {
  default: 'bg-blue-600 text-white',
  secondary: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  destructive: 'bg-red-600 text-white',
  warning: 'bg-amber-600 text-white',
  success: 'bg-emerald-600 text-white',
  outline: 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300',
};

function Badge({ variant = 'default', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${BADGE_VARIANTS[variant]} ${className}`}>
      {children}
    </span>
  );
}

function Spinner({ className = '' }) {
  return <Loader2 className={`w-3.5 h-3.5 animate-spin ${className}`} />;
}

export default function ProfileManagement({ darkMode }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');

  const [docId, setDocId] = useState(null);
  const [profile, setProfile] = useState({
    name: '', username: '', email: '', avatar: '', updatedAt: null, passwordUpdatedAt: null,
  });
  const [phone, setPhone] = useState('');

  // Audit logging hook
  const { logSuperAdminProfileUpdate, logSuperAdminPasswordChange } = useAuditLog();

  // Separate password state for email change vs password change
  const [emailConfirmPassword, setEmailConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showEmailConfirm, setShowEmailConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const uid = auth.currentUser?.uid;
  const cardBg = darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-800";
  const textSecondary = darkMode ? "text-slate-400" : "text-slate-500";
  const inputStyling = darkMode
    ? "bg-slate-950 border-slate-800 text-white focus:border-blue-500 focus:ring-blue-500/20"
    : "bg-white border-slate-200 text-slate-900 focus:border-blue-600 focus:ring-blue-600/10";
  const errorText = "text-xs text-red-500 mt-1";

  useEffect(() => {
    const loadProfile = async () => {
      if (!auth.currentUser) {
        setLoading(false);
        return;
      }
      try {
        const foundDocId = await resolveSuperAdminDocId(auth.currentUser);
        const data = foundDocId ? (await getDoc(doc(db, 'superadmin', foundDocId))).data() : null;

        setDocId(foundDocId || uid);

        if (data) {
          setProfile((prev) => ({
            ...prev,
            name: data.name || auth.currentUser.displayName || '',
            username: data.username || '',
            email: data.email || auth.currentUser.email || '',
            avatar: data.avatar || auth.currentUser.photoURL || '',
            updatedAt: data.updatedAt || null,
            passwordUpdatedAt: data.passwordUpdatedAt || null,
          }));
          setPhone(data.phone || auth.currentUser.phoneNumber || '');
        } else {
          setProfile((prev) => ({
            ...prev,
            name: auth.currentUser.displayName || '',
            email: auth.currentUser.email || '',
            avatar: auth.currentUser.photoURL || '',
          }));
          setPhone(auth.currentUser.phoneNumber || '');
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
        toast.error('Failed to load profile data.');
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [uid]);

  const handleFieldChange = (field, value) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileSelection = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file.');
      return;
    }
    setSelectedAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelection(file);
  };

  const handleAvatarDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelection(file);
  };

  // Upload avatar file to Backblaze B2 via server proxy
  const uploadAvatarToB2 = async (file) => {
    const toastId = toast.loading("Uploading profile image to storage...");
    try {
      const targetUid = docId || auth.currentUser?.uid || 'superadmin';
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uid', targetUid);

      const data = await fetchFromBackend('admin/upload-avatar', {
        method: 'POST',
        body: formData,
      });

      if (!data.success && !data.fileUrl) {
        throw new Error(data.error || data.message || 'Avatar upload failed');
      }

      toast.success("Profile image uploaded to Backblaze B2!", { id: toastId });
      return data.fileUrl;
    } catch (error) {
      console.error("Backblaze B2 Avatar Upload Error:", error);
      toast.error(error.message || "Failed to upload image to storage.", { id: toastId });
      throw error;
    }
  };

  const reauthenticate = async (passwordToConfirm) => {
    const user = auth.currentUser;
    if (!user?.email) {
      throw new Error('No authenticated user with an email credential.');
    }
    const credential = EmailAuthProvider.credential(user.email, passwordToConfirm);
    await reauthenticateWithCredential(user, credential);
  };

  const emailValid = EMAIL_REGEX.test(profile.email.trim());
  const phoneValid = !phone || isValidPhoneNumber(phone);
  const nameValid = profile.name.trim().length > 0;
  const usernameValid = profile.username.trim().length > 0;
  const emailChanged = !!auth.currentUser?.email && profile.email.trim().toLowerCase() !== auth.currentUser.email.toLowerCase();

  const isProfileValid = nameValid && usernameValid && emailValid && phoneValid;

  const allPasswordRequirementsMet = useMemo(
    () => DEFAULT_RULES.every((rule) => rule.test(newPassword)),
    [newPassword]
  );
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const isPasswordFormValid = currentPassword.length > 0 && allPasswordRequirementsMet && passwordsMatch;

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!docId) {
      toast.error('Could not determine your account record. Please refresh the page and try again.');
      return;
    }
    if (!isProfileValid) {
      if (!nameValid) toast.error('Full Name is required.');
      else if (!usernameValid) toast.error('Username is required.');
      else if (!emailValid) toast.error('Enter a valid email address.');
      else if (!phoneValid) toast.error('Enter a valid PH mobile number.');
      return;
    }

    setSaving(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error('You are not signed in. Please log in again.');
        setSaving(false);
        return;
      }

      // Step 1: Upload selected image to Backblaze B2 if a new file was chosen
      let finalAvatarUrl = profile.avatar;
      if (selectedAvatarFile) {
        setUploadingAvatar(true);
        try {
          finalAvatarUrl = await uploadAvatarToB2(selectedAvatarFile);
        } catch (uploadErr) {
          console.warn('Avatar upload to B2 failed, continuing with previous URL:', uploadErr);
        } finally {
          setUploadingAvatar(false);
        }
      }

      // Step 2: Email change re-authentication if email was modified
      if (emailChanged) {
        if (!emailConfirmPassword) {
          toast.error('Enter your current password to confirm the email change.');
          setSaving(false);
          return;
        }

        await reauthenticate(emailConfirmPassword);

        let usedVerificationFlow = false;
        try {
          if (typeof verifyBeforeUpdateEmail === 'function') {
            await verifyBeforeUpdateEmail(user, profile.email.trim());
            usedVerificationFlow = true;
          } else {
            await updateEmail(user, profile.email.trim());
          }
        } catch (emailErr) {
          if (
            emailErr.code === 'auth/operation-not-allowed' ||
            emailErr.code === 'auth/argument-error'
          ) {
            await updateEmail(user, profile.email.trim());
          } else {
            throw emailErr;
          }
        }

        if (usedVerificationFlow) {
          toast.success(
            'A verification link was sent to your new email. Click it to finish changing your sign-in email. Profile details were saved.'
          );
        }
      }

      // Step 3: Persist to Firestore `superadmin` document
      await setDoc(
        doc(db, 'superadmin', docId),
        {
          name: profile.name || '',
          username: profile.username || '',
          email: profile.email.trim() || '',
          phone: phone || '',
          avatar: finalAvatarUrl || '',
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // Step 4: Update Firebase Auth photoURL and displayName
      try {
        if (auth.currentUser) {
          await updateProfile(auth.currentUser, {
            displayName: profile.name || auth.currentUser.displayName,
            photoURL: finalAvatarUrl || auth.currentUser.photoURL,
          });
        }
      } catch (authProfileErr) {
        console.warn('Auth photoURL sync warning:', authProfileErr.message);
      }

      setEmailConfirmPassword('');
      setSelectedAvatarFile(null);
      setAvatarPreview('');
      setProfile((prev) => ({ ...prev, avatar: finalAvatarUrl }));

      await logSuperAdminProfileUpdate({
        name: profile.name,
        username: profile.username,
        email: profile.email.trim(),
        phone,
        avatar: finalAvatarUrl,
      });

      if (!emailChanged) {
        toast.success('Profile updated successfully!');
      } else {
        const emailNow = auth.currentUser?.email?.toLowerCase() || '';
        if (emailNow === profile.email.trim().toLowerCase()) {
          toast.success('Profile and email updated successfully!');
        }
      }
    } catch (error) {
      console.error('Failed to save profile:', error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect. Please try again.');
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error('Please re-enter your current password to confirm this change.');
      } else if (error.code === 'auth/email-already-in-use') {
        toast.error('That email address is already in use by another account.');
      } else if (error.code === 'auth/invalid-email') {
        toast.error('Please enter a valid email address.');
      } else if (error.code === 'auth/too-many-requests') {
        toast.error('Too many attempts. Please wait a moment and try again.');
      } else {
        toast.error(error.message || 'Failed to update profile.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!isPasswordFormValid) {
      if (!currentPassword) toast.error('Enter your current password to confirm this change.');
      else if (!allPasswordRequirementsMet) toast.error('New password does not meet all requirements yet.');
      else if (!passwordsMatch) toast.error('New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await reauthenticate(currentPassword);
      await updatePassword(auth.currentUser, newPassword);
      if (docId) {
        await setDoc(
          doc(db, 'superadmin', docId),
          { passwordUpdatedAt: serverTimestamp() },
          { merge: true }
        );
      }
      setProfile((prev) => ({ ...prev, passwordUpdatedAt: { toDate: () => new Date() } }));
      await logSuperAdminPasswordChange(auth.currentUser?.email || profile.email);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success('Password changed successfully!');
    } catch (error) {
      console.error('Failed to change password:', error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        toast.error('Current password is incorrect. Please try again.');
      } else if (error.code === 'auth/weak-password') {
        toast.error('New password is too weak. Try a longer, more varied password.');
      } else if (error.code === 'auth/requires-recent-login') {
        toast.error('Please re-enter your current password and try again.');
      } else {
        toast.error(error.message || 'Failed to change password.');
      }
    } finally {
      setChangingPassword(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return '—';
    const date = value?.toDate ? value.toDate() : new Date(value);
    return date.toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 gap-2">
        <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
        <span className={textSecondary}>Loading profile...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      <Toaster
        position="top-right"
        toastOptions={{
          style: darkMode
            ? { background: '#0f172a', color: '#fff', border: '1px solid #1e293b' }
            : { background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0' }
        }}
      />

      <div>
        <h1 className="text-2xl font-black tracking-tight">Edit Profile</h1>
      </div>

      {/* Personal Information Form */}
      <form onSubmit={handleSaveProfile} className={`p-6 rounded-2xl border shadow-xs space-y-6 ${cardBg}`}>

        {/* Backblaze B2 Profile Photo Upload */}
        <div className="text-center space-y-2">
          <div
            className="w-24 h-24 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 cursor-pointer overflow-hidden mx-auto hover:border-blue-500 transition-colors relative group"
            onClick={() => document.getElementById('profileAvatarUpload').click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleAvatarDrop}
            title="Click or drag image to change photo"
          >
            {avatarPreview || profile.avatar ? (
              <img
                src={avatarPreview || profile.avatar}
                alt="Avatar"
                className="w-full h-full object-cover"
              />
            ) : (
              <User className="w-10 h-10 text-slate-400" />
            )}
            {uploadingAvatar && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <Spinner className="text-white w-6 h-6" />
              </div>
            )}
          </div>
          <input
            type="file"
            id="profileAvatarUpload"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarUpload}
          />
          <p className={`text-xs ${textSecondary}`}>
            {selectedAvatarFile
              ? `Selected: ${selectedAvatarFile.name} (will save to Backblaze B2)`
              : 'Drag & drop or click to upload profile image'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className={`text-xs font-medium ${textSecondary}`}>Full Name <span className="text-red-500">*</span></label>
            <input
              type="text" value={profile.name} required
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className={`w-full mt-1 px-4 py-2 rounded-xl border focus:ring-4 outline-none transition-all ${inputStyling} ${!nameValid ? 'border-red-400' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-medium ${textSecondary}`}>Username <span className="text-red-500">*</span></label>
            <input
              type="text" value={profile.username} required
              onChange={(e) => handleFieldChange('username', e.target.value)}
              className={`w-full mt-1 px-4 py-2 rounded-xl border focus:ring-4 outline-none transition-all ${inputStyling} ${!usernameValid ? 'border-red-400' : ''}`}
            />
          </div>
          <div>
            <label className={`text-xs font-medium ${textSecondary}`}>Email Address <span className="text-red-500">*</span></label>
            <input
              type="email" value={profile.email} required
              onChange={(e) => handleFieldChange('email', e.target.value)}
              className={`w-full mt-1 px-4 py-2 rounded-xl border focus:ring-4 outline-none transition-all ${inputStyling} ${profile.email && !emailValid ? 'border-red-400' : ''}`}
            />
            {profile.email && !emailValid && <p className={errorText}>Enter a valid email address.</p>}
          </div>
          <div>
            <label className={`text-xs font-medium ${textSecondary}`}>Phone Number</label>
            <div className="mt-1">
              <PhoneInputField
                value={phone}
                onChange={(val) => setPhone(val || '')}
                darkMode={darkMode}
                error={phone && !phoneValid}
              />
            </div>
            {phone && !phoneValid && <p className={errorText}>Enter a valid PH mobile number.</p>}
          </div>
        </div>

        {/* Email-change confirmation password */}
        {emailChanged && (
          <div>
            <label className={`text-xs font-medium ${textSecondary}`}>
              Confirm Current Password <span className="text-red-500">*</span>
              <span className="font-normal"> (required only to change email)</span>
            </label>
            <div className="relative mt-1">
              <input
                type={showEmailConfirm ? 'text' : 'password'}
                value={emailConfirmPassword}
                onChange={(e) => setEmailConfirmPassword(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
                className={`w-full px-4 py-2 pr-10 rounded-xl border focus:ring-4 outline-none transition-all ${inputStyling}`}
              />
              <button
                type="button"
                onClick={() => setShowEmailConfirm(!showEmailConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer"
                tabIndex={-1}
              >
                {showEmailConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className={`text-xs mt-1 ${textSecondary}`}>
              Firebase requires a recent sign-in before changing your email.
            </p>
          </div>
        )}

        <div className="flex justify-end">
          {saving ? (
            <Badge variant="secondary" className="px-5 py-2">
              <Spinner /> Saving
            </Badge>
          ) : (
            <button
              type="submit"
              disabled={!isProfileValid || (emailChanged && !emailConfirmPassword)}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Save Changes
            </button>
          )}
        </div>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

        {/* Change Password Form */}
        <form onSubmit={handleChangePassword} className={`p-6 rounded-2xl border shadow-xs space-y-4 ${cardBg}`}>
          <h2 className="text-lg font-bold">Security</h2>
          <p className={`text-xs ${textSecondary}`}>
            Last password change: <span className="font-semibold">{formatDate(profile.passwordUpdatedAt)}</span>
          </p>

          <div>
            <label className={`text-xs font-medium ${textSecondary}`}>Current Password</label>
            <div className="relative mt-1">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className={`w-full px-4 py-2 pr-10 rounded-xl border focus:ring-4 outline-none transition-all ${inputStyling}`}
              />
              <button type="button" onClick={() => setShowCurrent(!showCurrent)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className={`text-xs font-medium ${textSecondary}`}>New Password</label>
            <div className="mt-1">
              <PasswordStrengthInput
                value={newPassword}
                onValueChange={setNewPassword}
                placeholder="Enter new password"
                showChecklist={true}
                showMeter={true}
              />
            </div>
          </div>

          <div>
            <label className={`text-xs font-medium ${textSecondary}`}>Confirm New Password</label>
            <div className="relative mt-1">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={`w-full px-4 py-2 pr-10 rounded-xl border focus:ring-4 outline-none transition-all ${inputStyling} ${confirmPassword && !passwordsMatch ? 'border-red-400' : ''}`}
              />
              <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer">
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && !passwordsMatch && <p className={errorText}>Passwords do not match.</p>}
          </div>

          <div className="flex justify-end">
            {changingPassword ? (
              <Badge variant="secondary" className="px-5 py-2">
                <Spinner /> Updating
              </Badge>
            ) : (
              <button
                type="submit"
                disabled={!isPasswordFormValid}
                className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Change Password
              </button>
            )}
          </div>
        </form>

        {/* Account Information Card */}
        <div className={`p-6 rounded-2xl border shadow-xs ${cardBg}`}>
          <h2 className="text-lg font-bold mb-4">Account Information</h2>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Role</dt>
              <dd className="mt-1 font-semibold">Super Administrator</dd>
            </div>
            <div>
              <dt className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Account Status</dt>
              <dd className="mt-1 inline-flex items-center gap-1.5 font-semibold text-emerald-500">
                <CheckCircle2 className="w-4 h-4" /> Active
              </dd>
            </div>
            <div>
              <dt className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Date Created</dt>
              <dd className="mt-1">{auth.currentUser?.metadata?.creationTime ? new Date(auth.currentUser.metadata.creationTime).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</dd>
            </div>
            <div>
              <dt className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Last Login</dt>
              <dd className="mt-1">{auth.currentUser?.metadata?.lastSignInTime ? new Date(auth.currentUser.metadata.lastSignInTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</dd>
            </div>
            <div>
              <dt className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Last Updated</dt>
              <dd className="mt-1">{formatDate(profile.updatedAt)}</dd>
            </div>
            <div>
              <dt className={`text-xs uppercase tracking-wider font-semibold ${textSecondary}`}>Sign-in Email</dt>
              <dd className="mt-1 break-all">{auth.currentUser?.email || '—'}</dd>
            </div>
          </dl>
        </div>

      </div>

    </div>
  );
}
