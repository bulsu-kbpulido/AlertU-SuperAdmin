import React, { useState, useMemo } from 'react';
import useNewRows from '../hooks/useNewRows';
import NewBadge from '../components/NewBadge';
import { 
  Eye, 
  ChevronLeft, 
  ChevronRight, 
  Archive, 
  Search
} from 'lucide-react';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
};

export default function ArchivedAdminsTable({
  admins = [],
  loading = false,
  searchTerm = '',
  onViewAdmin,
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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

  const { isNew, markSeen } = useNewRows('admins-archived', admins, {
    getTime: (item) => item.archivedAt || item.updatedAt || item.createdAt,
  });

  const paginatedAdmins = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAdmins.slice(start, start + itemsPerPage);
  }, [filteredAdmins, currentPage, itemsPerPage]);

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
      {/* Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                  <Archive className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600 mb-2" />
                  No archived administrator records found.
                </td>
              </tr>
            ) : (
              paginatedAdmins.map((admin) => {
                return (
                  <tr
                    key={admin.id} 
                    onClickCapture={() => markSeen(admin)}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    {/* Admin ID */}
                    <td className="px-6 py-4">
                      <span className="inline-block rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-mono font-bold tracking-wide text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80">
                        {admin.adminId || 'ID Pending'}
                      </span> {isNew(admin) && <NewBadge className="ml-2" />}
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

                    {/* Actions: View only */}
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <button
                          onClick={() => onViewAdmin && onViewAdmin(admin)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <Eye className="h-3.5 w-3.5" /> View
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
    </div>
  );
}
