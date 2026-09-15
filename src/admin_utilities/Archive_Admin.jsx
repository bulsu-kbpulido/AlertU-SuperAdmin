import React, { useState } from 'react';
import { FolderArchive, AlertTriangle, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuditLog } from '../useAuditLog';

export default function Archive_Admin({ isOpen, admin, onClose, onRefresh }) {
  const { logArchiveAdmin } = useAuditLog();
  const [loading, setLoading] = useState(false);

  if (!isOpen || !admin) return null;

  const handleArchive = async () => {
    setLoading(true);

    try {
      const adminRef = doc(db, 'admins', admin.id);
      await updateDoc(adminRef, {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.email || 'Super Administrator',
        updatedAt: serverTimestamp(),
      });

      await logArchiveAdmin(admin, 'SuperAdmin archived account');

      toast.success('Administrator account archived successfully.');
      if (onRefresh) onRefresh();
      onClose();
    } catch (err) {
      console.error('Failed to archive admin:', err);
      toast.error(err.message || 'Failed to archive administrator.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 shrink-0 border border-amber-200 dark:border-amber-900">
              <FolderArchive className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Archive Administrator Account?
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Are you sure you want to archive access for{' '}
                <strong className="text-slate-900 dark:text-slate-200">
                  {admin.name || admin.email || 'this administrator'}
                </strong>
                ? This will move the account to the Archived Vault and exclude them from active administration counts. You can restore this account at any time.
              </p>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleArchive}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow disabled:opacity-50 transition-colors cursor-pointer"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Yes, Archive Account</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
