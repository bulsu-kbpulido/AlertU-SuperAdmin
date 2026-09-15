import React, { useState, useMemo } from 'react';
import { 
  RotateCcw, 
  Eye, 
  ChevronLeft, 
  ChevronRight, 
  Archive, 
  Loader2, 
  Check,
  Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuditLog } from '../useAuditLog';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
};

export default function ArchivedAdminsTable({
  admins = [],
  loading = false,
  searchTerm = '',
  onViewAdmin,
  onRefresh,
}) {
  const { logRestoreAdmin } = useAuditLog();

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Dialog states
  const [targetAdmin, setTargetAdmin] = useState(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [isBatchRestoreModalOpen, setIsBatchRestoreModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Filter archived admins
  const filteredAdmins = useMemo(() => {
    return admins.filter((admin) => {
      if (!admin.archived) return false;
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
        admin.name?.toLowerCase().includes(term) ||
        admin.email?.toLowerCase().includes(term) ||
        admin.adminId?.toLowerCase().includes(term) ||
        admin.phone?.toLowerCase().includes(term)
      );
    });
  }, [admins, searchTerm]);

  const totalPages = Math.ceil(filteredAdmins.length / itemsPerPage) || 1;

  const paginatedAdmins = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAdmins.slice(start, start + itemsPerPage);
  }, [filteredAdmins, currentPage, itemsPerPage]);

  // Checkbox helpers
  const isAllPageSelected = 
    paginatedAdmins.length > 0 && 
    paginatedAdmins.every((a) => selectedIds.has(a.id));

  const handleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isAllPageSelected) {
        paginatedAdmins.forEach((a) => next.delete(a.id));
      } else {
        paginatedAdmins.forEach((a) => next.add(a.id));
      }
      return next;
    });
  };

  const handleToggleRow = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Restore single admin
  const handleRestore = async () => {
    if (!targetAdmin) return;
    setIsSubmitting(true);

    try {
      await updateDoc(doc(db, 'admins', targetAdmin.id), {
        archived: false,
        archivedAt: null,
        archivedBy: null,
        updatedAt: serverTimestamp(),
      });

      await logRestoreAdmin(targetAdmin);

      toast.success(`Account restored for ${targetAdmin.name || 'administrator'}.`);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(targetAdmin.id);
        return next;
      });
      setIsRestoreModalOpen(false);
      setTargetAdmin(null);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to restore admin:', err);
      toast.error(err.message || 'Failed to restore account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Batch restore
  const handleBatchRestore = async () => {
    setIsSubmitting(true);
    const count = selectedIds.size;

    try {
      const selectedAdmins = admins.filter((a) => selectedIds.has(a.id));
      await Promise.all(
        selectedAdmins.map((a) =>
          updateDoc(doc(db, 'admins', a.id), {
            archived: false,
            archivedAt: null,
            archivedBy: null,
            updatedAt: serverTimestamp(),
          })
        )
      );

      for (const a of selectedAdmins) {
        await logRestoreAdmin(a);
      }

      toast.success(`Successfully restored ${count} administrators.`);
      setSelectedIds(new Set());
      setIsBatchRestoreModalOpen(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Batch restore error:', err);
      toast.error(err.message || 'Failed to complete batch restore.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    let date;
    if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
    } else if (timestamp._seconds) {
      date = new Date(timestamp._seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    return isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
  };

  return (
    <div className="w-full">
      {/* Batch Actions Floating Toolbar */}
      {selectedIds.size > 0 && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border-b border-blue-200 dark:border-blue-900/60 px-6 py-3 flex items-center justify-between animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-600 text-white">
              {selectedIds.size}
            </span>
            <span className="text-xs font-semibold text-blue-900 dark:text-blue-300">
              {selectedIds.size === 1 ? 'account selected' : 'accounts selected'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsBatchRestoreModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Batch Restore
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <th className="px-6 py-4 w-10">
                <input
                  type="checkbox"
                  checked={isAllPageSelected}
                  onChange={handleSelectAll}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </th>
              <th className="px-6 py-4">Admin ID</th>
              <th className="px-6 py-4">Administrator</th>
              <th className="px-6 py-4">Phone</th>
              <th className="px-6 py-4">Archived Date</th>
              <th className="px-6 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {paginatedAdmins.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                  <Archive className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600 mb-2" />
                  No archived administrator records found.
                </td>
              </tr>
            ) : (
              paginatedAdmins.map((admin) => {
                const isSelected = selectedIds.has(admin.id);
                return (
                  <tr
                    key={admin.id}
                    className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${
                      isSelected ? 'bg-blue-50/30 dark:bg-blue-950/20' : ''
                    }`}
                  >
                    <td className="px-6 py-4">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(admin.id)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>

                    {/* Admin ID */}
                    <td className="px-6 py-4">
                      <span className="inline-block rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-mono font-bold tracking-wide text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80">
                        {admin.adminId || 'ID Pending'}
                      </span>
                    </td>

                    {/* Full Name & Avatar */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden ${admin.avatarBg || 'bg-slate-500'}`}>
                          {admin.avatar ? (
                            <img src={admin.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            getInitials(admin.name)
                          )}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-slate-100">{admin.name || 'Unnamed Admin'}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{admin.email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-6 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                      {admin.phone || '—'}
                    </td>

                    {/* Archived Date */}
                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                      {formatDate(admin.archivedAt)}
                    </td>

                    {/* Actions: View and Restore only */}
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          onClick={() => onViewAdmin && onViewAdmin(admin)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
                        </button>

                        <button
                          onClick={() => {
                            setTargetAdmin(admin);
                            setIsRestoreModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60 px-2.5 py-1.5 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-100 transition-colors cursor-pointer"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredAdmins.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 px-6 py-4 gap-3">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.min(currentPage * itemsPerPage, filteredAdmins.length)}</span> of{' '}
            <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredAdmins.length}</span> archived records
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" /> Previous
            </button>
            <span className="text-xs text-slate-600 dark:text-slate-400 px-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Single Restore Dialog */}
      {isRestoreModalOpen && targetAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-200 dark:border-emerald-900">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Restore Administrator Account?</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Are you sure you want to restore access for{' '}
                  <strong className="text-slate-900 dark:text-slate-200">{targetAdmin.name}</strong>? This account will return to the active accounts directory.
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => { setIsRestoreModalOpen(false); setTargetAdmin(null); }}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRestore}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Yes, Restore Account</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Restore Dialog */}
      {isBatchRestoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 shrink-0 border border-emerald-200 dark:border-emerald-900">
                <RotateCcw className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Batch Restore Accounts?</h3>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                  Are you sure you want to restore all <strong className="text-slate-900 dark:text-slate-200">{selectedIds.size}</strong> selected administrator accounts?
                </p>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsBatchRestoreModalOpen(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchRestore}
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow disabled:opacity-50 transition-colors cursor-pointer"
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>Restore {selectedIds.size} Accounts</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
