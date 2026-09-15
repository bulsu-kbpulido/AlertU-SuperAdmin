import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  User,
  Mail,
  Phone,
  Shield,
  Calendar,
  Clock,
  Circle,
  X
} from 'lucide-react';

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
};

export default function View_Admin({ isOpen, admin: propAdmin, onClose, isOnline: propIsOnline }) {
  const [admin, setAdmin] = useState(propAdmin);

  const adminId = propAdmin?.id || propAdmin?.uid;

  useEffect(() => {
    if (propAdmin) {
      setAdmin(propAdmin);
    }
  }, [propAdmin]);

  // Real-time updates from Firestore if modal is open
  useEffect(() => {
    if (!isOpen || !adminId) return;

    const unsubscribe = onSnapshot(
      doc(db, 'admins', String(adminId)),
      (snapshot) => {
        if (snapshot.exists()) {
          setAdmin({ id: snapshot.id, ...snapshot.data() });
        }
      },
      (error) => {
        console.error('Firestore Error in View_Admin:', error);
      }
    );

    return () => unsubscribe();
  }, [isOpen, adminId]);

  if (!isOpen || !admin) return null;

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
          hour: '2-digit',
          minute: '2-digit',
        });
  };

  const isOnline = typeof propIsOnline === 'boolean' 
    ? propIsOnline 
    : Boolean(admin.isActive || admin.isOnline);

  const isDisabled = Boolean(admin.isDisabled) || admin.status === 'Disabled';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="border-b border-slate-100 dark:border-slate-800 p-6 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center text-white text-lg font-bold shrink-0 shadow-inner overflow-hidden ${admin.avatarBg || 'bg-blue-600'}`}>
              {admin.avatar ? (
                <img src={admin.avatar} alt="" className="w-full h-full object-cover rounded-2xl" />
              ) : (
                getInitials(admin.name)
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {admin.name || 'Administrator Details'}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {admin.adminId || 'ID Pending'}
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                  {admin.department || 'Department Admin'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Real-time Presence Badge */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                isOnline
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
              }`}
            >
              <Circle className={`h-2 w-2 fill-current ${isOnline ? 'animate-pulse text-emerald-500' : 'text-slate-400'}`} />
              {isOnline ? 'Online' : 'Offline'}
            </span>

            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Details Grid */}
        <div className="p-6 md:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Email Address */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <Mail className="h-4 w-4 text-blue-500" />
                Email Address
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 break-all">
                {admin.email || '—'}
              </p>
            </div>

            {/* Phone Number */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <Phone className="h-4 w-4 text-blue-500" />
                Phone Number
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {admin.phone || '—'}
              </p>
            </div>

            {/* Admin ID */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <Shield className="h-4 w-4 text-blue-500" />
                System Identifier
              </div>
              <p className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-200">
                {admin.adminId || admin.uid || '—'}
              </p>
            </div>

            {/* Account Status */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <Shield className="h-4 w-4 text-blue-500" />
                Access Status
              </div>
              <p className={`text-sm font-bold ${isDisabled ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {isDisabled ? 'Disabled' : 'Active'}
              </p>
            </div>

            {/* Date Joined */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <Calendar className="h-4 w-4 text-blue-500" />
                Registered On
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {formatDate(admin.createdAt || admin.created)}
              </p>
            </div>

            {/* Last Login */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500 text-xs font-semibold uppercase tracking-wider">
                <Clock className="h-4 w-4 text-blue-500" />
                Last Login
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {formatDate(admin.lastLogin || admin.lastLoginAt || admin.lastSignInTime)}
              </p>
            </div>

          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-slate-100 dark:border-slate-800 p-4 px-6 flex justify-end bg-slate-50/50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 shadow-sm transition-all"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
}
