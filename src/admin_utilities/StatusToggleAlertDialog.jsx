import React from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

export default function StatusToggleAlertDialog({
  isOpen,
  admin,
  isCurrentlyActive,
  loading,
  onConfirm,
  onClose,
}) {
  if (!isOpen || !admin) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in-0 duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-4">
          <div className={`rounded-full p-3 ${
            isCurrentlyActive 
              ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' 
              : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400'
          }`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 id="dialog-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {isCurrentlyActive ? 'Disable Administrator Account?' : 'Enable Administrator Account?'}
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Are you sure you want to {isCurrentlyActive ? 'disable' : 'enable'} access for{' '}
              <strong className="text-slate-900 dark:text-slate-200">
                {admin.name || admin.adminId || admin.email || 'this administrator'}
              </strong>
              ? {isCurrentlyActive 
                  ? ' This will prevent them from signing in or performing administrative operations.' 
                  : ' This will restore their active status and permit normal system operations.'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow transition-colors disabled:opacity-50 cursor-pointer ${
              isCurrentlyActive 
                ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500' 
                : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500'
            }`}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isCurrentlyActive ? 'Yes, Disable Account' : 'Yes, Enable Account'}
          </button>
        </div>
      </div>
    </div>
  );
}
