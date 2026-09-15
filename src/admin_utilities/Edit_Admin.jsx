import React, { useState, useEffect } from 'react';
import { 
  Edit3, 
  User, 
  Mail, 
  Phone, 
  Loader2,
  X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { isValidPhoneNumber } from 'react-phone-number-input';
import { PhoneInput } from '@/components/reui/phone-input';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { fetchFromBackend } from '../api';
import { useAuditLog } from '../useAuditLog';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Helper: Format raw PH numbers (e.g., "09171234567" -> "+639171234567")
const formatToE164Phone = (phoneNumber) => {
  if (!phoneNumber) return '';
  let cleaned = String(phoneNumber).trim();
  if (cleaned.startsWith('09')) {
    return `+63${cleaned.slice(1)}`;
  }
  if (!cleaned.startsWith('+') && cleaned.startsWith('63')) {
    return `+${cleaned}`;
  }
  return cleaned;
};

export default function Edit_Admin({ isOpen, admin, onClose, onRefresh }) {
  const { logEditAdmin } = useAuditLog();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    department: 'general',
  });
  const [phone, setPhone] = useState('');
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (admin) {
      setFormData({
        name: admin.name || '',
        email: admin.email || '',
        department: admin.department || 'general',
      });
      setPhone(formatToE164Phone(admin.phone || ''));
      setAvatarPreview(admin.avatar || '');
      setSelectedAvatarFile(null);
    }
  }, [admin, isOpen]);

  if (!isOpen || !admin) return null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
    const file = e.target.files?.[0];
    if (file) handleFileSelection(file);
  };

  const handleAvatarDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelection(file);
  };

  const uploadAvatarToB2 = async (file) => {
    const targetUid = admin.uid || admin.id || 'admin_edit';
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);
    formDataUpload.append('uid', targetUid);

    const data = await fetchFromBackend('admin/upload-avatar', {
      method: 'POST',
      body: formDataUpload,
    });

    if (!data.success && !data.fileUrl) {
      throw new Error(data.error || data.message || 'Avatar upload failed');
    }
    return data.fileUrl;
  };

  const nameValid = formData.name.trim().length > 0;
  const emailValid = EMAIL_REGEX.test(formData.email.trim());
  const phoneValid = !phone || isValidPhoneNumber(phone);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!nameValid) {
      toast.error('Full Name is required.');
      return;
    }
    if (!emailValid) {
      toast.error('Enter a valid email address.');
      return;
    }
    if (phone && !phoneValid) {
      toast.error('Enter a valid phone number.');
      return;
    }

    setIsSubmitting(true);

    try {
      let finalAvatarUrl = admin.avatar || '';
      if (selectedAvatarFile) {
        finalAvatarUrl = await uploadAvatarToB2(selectedAvatarFile);
      }

      const updatedFields = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: phone || '',
        avatar: finalAvatarUrl,
        department: formData.department || 'general',
        updatedAt: serverTimestamp(),
      };

      // 1. Update Firestore Database
      const adminRef = doc(db, 'admins', admin.id);
      await updateDoc(adminRef, updatedFields);

      // 2. Synchronize to Auth backend if UID is available
      if (admin.uid) {
        try {
          await fetchFromBackend('admin/update-admin-auth', {
            method: 'POST',
            body: JSON.stringify({
              uid: admin.uid,
              name: formData.name.trim(),
              email: formData.email.trim(),
              phone: phone || '',
              avatar: finalAvatarUrl,
              department: formData.department || 'general',
            }),
          });
        } catch (backendErr) {
          console.warn('Backend Auth update warning:', backendErr);
        }
      }

      // 3. Log Audit Action
      await logEditAdmin({ ...admin, ...updatedFields }, updatedFields);

      toast.success('Admin profile updated successfully!');
      if (onRefresh) onRefresh(updatedFields);
      onClose();
    } catch (err) {
      console.error('Error updating admin profile:', err);
      toast.error(err.message || 'Failed to update administrator profile.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="border-b border-slate-100 dark:border-slate-800 p-5 px-6 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900">
              <Edit3 className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Edit Administrator Profile</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  {admin.adminId || admin.id}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} autoComplete="off" className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            
            {/* Avatar Section */}
            <div className="flex flex-col items-center justify-center pb-2">
              <div
                className="relative w-20 h-20 rounded-full flex items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 cursor-pointer overflow-hidden hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-slate-50 dark:bg-slate-800/50"
                onClick={() => document.getElementById('editAdminAvatarInput')?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleAvatarDrop}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-slate-400 dark:text-slate-500" />
                )}
              </div>
              <input
                type="file"
                id="editAdminAvatarInput"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mt-2">
                {selectedAvatarFile ? selectedAvatarFile.name : 'Click to change profile image'}
              </p>
            </div>

            {/* Full Name */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Full Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                required
                value={formData.name}
                onChange={handleInputChange}
                className="w-full mt-1.5 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

            {/* Phone Number */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Phone Number
              </label>
              <div className="mt-1.5">
                <PhoneInput
                  value={phone}
                  onChange={(val) => setPhone(val || '')}
                  defaultCountry="PH"
                  international
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>
            </div>

            {/* Email Address */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                required
                value={formData.email}
                onChange={handleInputChange}
                className="w-full mt-1.5 px-3.5 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
            </div>

          </div>

          {/* Modal Footer */}
          <div className="border-t border-slate-100 dark:border-slate-800 p-4 px-6 flex items-center justify-end gap-3 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow disabled:opacity-50 transition-colors cursor-pointer"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
