import { useEffect, useState, useMemo } from 'react';
import { Activity, Users, UserCheck, Clock, FileText, Radio } from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { onAuditLogReceived } from '../socket';
import { isMeaningfulAdminActivity, formatActionDisplay, getActionCategory } from '../utils/auditActivity';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import SecurityFlagsWidget from '../components/SecurityFlagsWidget';
import OnlineAdminsWidget from '../components/OnlineAdminsWidget';

const parseDate = (val) => {
  if (!val) return null;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

// Compact "how long ago" string for surfacing stale/unreviewed reports
const timeAgo = (date) => {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function Dashboard({ darkMode, setActivePage }) {
  useDocumentTitle('Dashboard – AlertU');

  const [admins, setAdmins] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  // 1. Real-time Firestore sync for Admins
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'admins'),
      (snapshot) => {
        const adminList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        adminList.sort((a, b) => {
          const aTime = parseDate(a.createdAt)?.getTime() || 0;
          const bTime = parseDate(b.createdAt)?.getTime() || 0;
          return bTime - aTime;
        });
        setAdmins(adminList);
        setLoadingAdmins(false);
      },
      (error) => {
        console.error('Error fetching admins from Firestore:', error);
        setLoadingAdmins(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore sync for Audit Logs
  // IMPORTANT: orderBy is required before limit() here. Without it, Firestore
  // has no guaranteed ordering and limit(150) can return an arbitrary subset
  // of documents — which, once the collection grows past 150 entries, can
  // easily exclude the newest ones entirely. That's why "Recent Admin
  // Activity" appeared frozen on old dates (e.g. Sep 10) even after many new
  // actions were performed and successfully logged to the backend: the new
  // documents were being written, just never included in the fetched window.
  useEffect(() => {
    const logsQuery = query(
      collection(db, 'audit_logs'),
      orderBy('createdAt', 'desc'),
      limit(150)
    );
    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => {
        const logsList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        logsList.sort((a, b) => {
          const aTime = parseDate(a.createdAt)?.getTime() || parseDate(a.timestamp)?.getTime() || 0;
          const bTime = parseDate(b.createdAt)?.getTime() || parseDate(b.timestamp)?.getTime() || 0;
          return bTime - aTime;
        });
        setAuditLogs(logsList);
        setLoadingLogs(false);
      },
      (error) => {
        console.error('Error fetching audit logs from Firestore:', error);
        setLoadingLogs(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 3. Instant Socket.IO Listener for live pushed logs
  useEffect(() => {
    const unsubscribeSocket = onAuditLogReceived((newLog) => {
      if (!newLog) return;
      setAuditLogs((prev) => {
        const exists = prev.some(
          (l) => l.id === newLog.eventId || l.eventId === newLog.eventId
        );
        if (exists) return prev;
        return [newLog, ...prev];
      });
    });
    return () => unsubscribeSocket();
  }, []);

  // Filter out noise so SuperAdmin focuses purely on meaningful admin actions
  const meaningfulLogs = useMemo(() => {
    return auditLogs.filter(isMeaningfulAdminActivity);
  }, [auditLogs]);

  // Admin statistics calculations
  const nonArchivedAdmins = admins.filter((a) => !a.archived);
  const totalAdmins = nonArchivedAdmins.length;
  // Same "enabled" rule AdminManagement uses: isDisabled boolean first, otherwise
  // status !== 'disabled' (case-insensitive). The old check only matched lowercase
  // 'active', so accounts saved as 'Active' (or any other status) were not counted.
  const activeAdmins = nonArchivedAdmins.filter((a) =>
    typeof a.isDisabled === 'boolean'
      ? !a.isDisabled
      : String(a.status || '').toLowerCase() !== 'disabled'
  ).length;

  // Compute Last Admin Login from both Firestore admin documents and audit_logs events
  const lastLoginInfo = useMemo(() => {
    let latestAdmin = null;
    let latestDate = null;

    // Source 1: Check admin records
    nonArchivedAdmins.forEach((admin) => {
      const d = parseDate(admin.lastLogin || admin.lastLoginAt || admin.lastSignInTime || admin.metadata?.lastSignInTime);
      if (d && (!latestDate || d > latestDate)) {
        latestDate = d;
        latestAdmin = admin.name || admin.displayName || admin.fullName || admin.email || 'Admin';
      }
    });

    // Source 2: Check audit_logs collection for recent login events
    auditLogs.forEach((log) => {
      const act = String(log.action || '').toUpperCase();
      // Match LOGIN, LOGIN_SUCCESS, SIGN_IN, AUTH_SUCCESS, ADMIN_LOGIN, etc., but exclude failures
      const isLoginSuccess =
        (act.includes('LOGIN') || act.includes('SIGN_IN') || act.includes('AUTH_SUCCESS') || act.includes('AUTHENTICAT')) &&
        !act.includes('FAIL') &&
        !act.includes('ERROR') &&
        !act.includes('DENIED') &&
        !act.includes('INVALID');

      if (isLoginSuccess) {
        const d = parseDate(log.createdAt || log.timestamp || log.metadata?.loggedInAt || log.metadata?.attemptedAt);
        if (d && (!latestDate || d > latestDate)) {
          latestDate = d;
          latestAdmin = log.adminName || log.performedBy || log.name || log.metadata?.email || log.adminId || 'Admin';
        }
      }
    });

    if (!latestAdmin && !latestDate) {
      if (nonArchivedAdmins.length > 0) {
        const newest = nonArchivedAdmins[0];
        const d = parseDate(newest.createdAt || newest.created);
        return {
          value: d
            ? d.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                hour12: true,
              })
            : 'No records',
          subtitle: newest.name
            ? `Registered: ${newest.name}`
            : 'No sign-ins recorded yet',
        };
      }
      return {
        value: 'No records',
        subtitle: 'No sign-ins recorded yet',
      };
    }

    // Format human-friendly time and date as primary metric value
    const dateFormatted = latestDate.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    return {
      value: dateFormatted,
      subtitle: `by ${latestAdmin}`,
    };
  }, [nonArchivedAdmins, auditLogs]);

  const stats = [
    {
      label: 'Total Admins',
      value: loadingAdmins ? '...' : `${totalAdmins}`,
      change: 'Registered in the admin platform',
      icon: Users,
      color: darkMode ? 'border-emerald-500 text-emerald-400 bg-emerald-950/40' : 'border-emerald-500 text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Active Admins',
      value: loadingAdmins ? '...' : `${activeAdmins}`,
      change: 'Currently active status',
      icon: UserCheck,
      color: darkMode ? 'border-emerald-500 text-emerald-400 bg-emerald-950/40' : 'border-emerald-500 text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Last Admin Login',
      value: loadingAdmins && loadingLogs
        ? '...'
        : lastLoginInfo.value,
      change: loadingAdmins && loadingLogs
        ? '...'
        : lastLoginInfo.subtitle,
      icon: Clock,
      color: darkMode ? 'border-amber-500 text-amber-400 bg-amber-950/40' : 'border-amber-500 text-amber-600 bg-amber-50',
    },
    {
      label: 'Admin Activities',
      value: loadingLogs ? '...' : `${meaningfulLogs.length}`,
      change: 'Operational events captured live',
      icon: FileText,
      color: darkMode ? 'border-slate-500 text-slate-400 bg-slate-800/40' : 'border-slate-400 text-slate-600 bg-slate-100',
    },
  ];

  const cardBg = darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-800";
  const rowBg = darkMode ? "bg-slate-950/50 border-slate-800 hover:border-slate-700" : "bg-slate-50 border-slate-100 hover:border-slate-300";
  const innerIconBg = darkMode ? "bg-slate-800/80" : "bg-white/80";

  const formatTimestamp = (ts, isoTimestamp) => {
    const d = parseDate(ts) || parseDate(isoTimestamp);
    if (!d) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className={`p-5 rounded-xl border-l-4 shadow-xs flex items-center justify-between ${cardBg} ${stat.color}`}>
              <div className="space-y-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{stat.label}</span>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight">{stat.value}</h3>
                <span className={`text-xs font-medium block ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>{stat.change}</span>
              </div>
              <div className={`p-3 rounded-lg shadow-xs shrink-0 ${innerIconBg}`}>
                <Icon className="w-6 h-6" />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Recent Admin Activity Log Stream */}
        <div className={`p-6 rounded-xl border shadow-xs lg:col-span-2 ${cardBg}`}>
          <div className={`flex items-center justify-between border-b pb-4 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                Recent Admin Activity
              </h2>
              <p className="text-xs text-slate-400">
                Key incident dispatches, user updates, and system movements by administrators.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                LIVE STREAM
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {loadingLogs && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading activities from Firebase...</p>
            )}
            {!loadingLogs && meaningfulLogs.length === 0 && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No administrator activities recorded yet.</p>
            )}
            {meaningfulLogs.slice(0, 8).map((log) => {
              const actorName = log.adminName || log.performedBy || 'Admin Operator';
              const adminId = log.adminId || null;
              const dept = log.department || log.metadata?.department || null;
              const targetDesc = log.target || log.targetUser || '';
              const actionTitle = formatActionDisplay(log.action);
              const logDate = parseDate(log.createdAt) || parseDate(log.timestamp);
              const isRecent = logDate && (Date.now() - logDate.getTime() < 5 * 60 * 1000);
              // Severity only makes sense for incident-related actions (not profile updates, etc.)
              const severity = getActionCategory(log) === 'INCIDENTS' ? log.metadata?.verifiedSeverity : null;
              const reportTitle = log.metadata?.reportTitle;
              const agencies = Array.isArray(log.metadata?.selectedAgencies) ? log.metadata.selectedAgencies : [];

              return (
                <div key={log.id || log.eventId} className={`p-3.5 rounded-lg border transition-colors ${rowBg}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="mt-1 shrink-0">
                        {isRecent ? (
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                          </span>
                        ) : (
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 block" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {actionTitle}
                          </span>
                          {isRecent && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 uppercase tracking-wider">
                              Live
                            </span>
                          )}
                          {severity && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              severity === 'Critical' || severity === 'High'
                                ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                                : severity === 'Moderate' || severity === 'Medium'
                                ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
                            }`}>
                              {severity}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                          <strong className="font-semibold text-slate-700 dark:text-slate-300">
                            {actorName}
                          </strong>
                          {adminId && (
                            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                              {adminId}
                            </span>
                          )}
                          {dept && (
                            <span className="px-1.5 py-0.5 rounded font-semibold text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              {dept}
                            </span>
                          )}
                          {targetDesc && (
                            <span>• Target: <strong className="text-slate-700 dark:text-slate-300">{targetDesc}</strong></span>
                          )}
                          {reportTitle && reportTitle !== targetDesc && (
                            <span className="truncate max-w-[200px] italic">({reportTitle})</span>
                          )}
                        </div>

                        {agencies.length > 0 && (
                          <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                            <span className="text-xs text-slate-400">Agencies:</span>
                            {agencies.map((agency, idx) => (
                              <span key={idx} className="px-1.5 py-0.2 rounded text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                {agency}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 pl-2">
                      <span className={`text-xs font-mono font-bold block ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        {formatTimestamp(log.createdAt, log.timestamp)}
                      </span>
                      {logDate && (
                        <span className="text-xs text-slate-400 block mt-0.5">
                          {timeAgo(logDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side column: who is online + accounts that need attention.
            (Pending Review / Active Incidents live in Incident Overview / Report Statistics) */}
        <div className="space-y-6">
          <OnlineAdminsWidget admins={admins} loading={loadingAdmins} darkMode={darkMode} />
          <SecurityFlagsWidget
            admins={admins}
            auditLogs={auditLogs}
            loading={loadingAdmins || loadingLogs}
            darkMode={darkMode}
            onReview={setActivePage ? () => setActivePage('admins') : undefined}
          />
        </div>

      </div>

    </div>
  );
}
