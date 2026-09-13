import { useEffect, useState, useMemo } from 'react';
import { Activity, Users, UserCheck, Clock, FileText, AlertTriangle, Inbox } from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  query,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { onAuditLogReceived } from '../socket';
import { isMeaningfulAdminActivity, formatActionDisplay } from '../utils/auditActivity';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const RESOLVED_ACTIONS = new Set(['RESOLVE_REPORT', 'ARCHIVE_REPORT', 'REJECT_REPORT']);
const REPORT_FETCH_LIMIT = 100;

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

export default function Dashboard({ darkMode }) {
  useDocumentTitle('Dashboard – AlertU');

  const [admins, setAdmins] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [reports, setReports] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [reportsError, setReportsError] = useState(null);

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
  useEffect(() => {
    const logsQuery = query(
      collection(db, 'audit_logs'),
      limit(60)
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

  // 4. Real-time Firestore sync for Reports (read-only, for Pending Review oversight)
  useEffect(() => {
    const reportsQuery = query(
      collection(db, 'reports'),
      limit(REPORT_FETCH_LIMIT)
    );
    const unsubscribe = onSnapshot(
      reportsQuery,
      (snapshot) => {
        const reportList = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setReports(reportList);
        setLoadingReports(false);
        setReportsError(null);
      },
      (error) => {
        console.error('Error fetching reports from Firestore:', error);
        setReportsError(error.message || 'Unable to load reports.');
        setLoadingReports(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Filter out noise so SuperAdmin focuses purely on meaningful admin actions
  const meaningfulLogs = useMemo(() => {
    return auditLogs.filter(isMeaningfulAdminActivity);
  }, [auditLogs]);

  // Admin statistics calculations
  const nonArchivedAdmins = admins.filter((a) => !a.archived);
  const totalAdmins = nonArchivedAdmins.length;
  const activeAdmins = nonArchivedAdmins.filter(
    (a) => a.status === 'active' || a.status === undefined || a.status === null
  ).length;

  // Pending Review: reports with no status yet (not verified, not rejected, not duplicate) —
  // meaning no admin has taken any action on them yet.
  const pendingReports = useMemo(() => {
    const results = reports
      .filter((r) => !r.status && r.isDuplicate !== true)
      .map((r) => ({
        id: r.reportID || r.id,
        title: r.reportTitle || r.incidentType || r.hazard || 'General Incident',
        submittedAt: parseDate(r.timestamp || r.createdAt || r.submittedAt),
      }));

    return results.sort((a, b) => (a.submittedAt?.getTime() || 0) - (b.submittedAt?.getTime() || 0));
  }, [reports]);

  // Active Incidents: reports with a generated share link that don't yet have a
  // later resolve/archive/reject action logged against the same target.
  const activeIncidents = useMemo(() => {
    const byTarget = {};
    auditLogs.forEach((log) => {
      const target = log.target || log.targetUser;
      if (!target) return;
      if (!byTarget[target]) byTarget[target] = [];
      byTarget[target].push(log);
    });

    const results = [];
    Object.entries(byTarget).forEach(([target, logs]) => {
      const sorted = [...logs].sort((a, b) => {
        const aTime = parseDate(a.createdAt)?.getTime() || parseDate(a.timestamp)?.getTime() || 0;
        const bTime = parseDate(b.createdAt)?.getTime() || parseDate(b.timestamp)?.getTime() || 0;
        return bTime - aTime;
      });

      const shareLog = sorted.find((l) => String(l.action || '').toUpperCase() === 'GENERATE_SHARE_LINK');
      if (!shareLog) return;

      const shareTime = parseDate(shareLog.createdAt)?.getTime() || parseDate(shareLog.timestamp)?.getTime() || 0;

      const hasLaterResolution = sorted.some((l) => {
        const act = String(l.action || '').toUpperCase();
        if (!RESOLVED_ACTIONS.has(act)) return false;
        const t = parseDate(l.createdAt)?.getTime() || parseDate(l.timestamp)?.getTime() || 0;
        return t >= shareTime;
      });

      if (hasLaterResolution) return;

      results.push({
        target,
        adminName: shareLog.adminName || shareLog.performedBy || 'Admin',
        time: parseDate(shareLog.createdAt) || parseDate(shareLog.timestamp),
      });
    });

    return results.sort((a, b) => (b.time?.getTime() || 0) - (a.time?.getTime() || 0));
  }, [auditLogs]);

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
      change: 'Registered across all departments',
      icon: Users,
      color: darkMode ? 'border-purple-500 text-purple-400 bg-purple-950/40' : 'border-purple-500 text-purple-600 bg-purple-50',
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
      color: darkMode ? 'border-blue-500 text-blue-400 bg-blue-950/40' : 'border-blue-500 text-blue-600 bg-blue-50',
    },
  ];

  const cardBg = darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-800";
  const rowBg = darkMode ? "bg-slate-950/50 border-slate-800 hover:border-slate-700" : "bg-slate-50 border-slate-100 hover:border-slate-300";
  const innerIconBg = darkMode ? "bg-slate-800/80" : "bg-white/80";
  const pendingRowBorder = darkMode ? "border-rose-500 bg-rose-950/30" : "border-rose-500 bg-rose-50";
  const incidentRowBorder = darkMode ? "border-amber-500 bg-amber-950/30" : "border-amber-500 bg-amber-50";

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
                <h3 className="text-xl sm:text-2xl font-black tracking-tight">{stat.value}</h3>
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
              const targetDesc = log.target || log.targetUser || '';
              const actionTitle = formatActionDisplay(log.action);

              return (
                <div key={log.id || log.eventId} className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${rowBg}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm font-semibold block truncate text-slate-900 dark:text-slate-100">
                        {actionTitle}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate block">
                        <strong className="font-semibold text-slate-700 dark:text-slate-300">{actorName}</strong>
                        {targetDesc ? ` • Target: ${targetDesc}` : ''}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 pl-3">
                    <span className={`text-xs font-mono font-bold block ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                      {formatTimestamp(log.createdAt, log.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Incident Oversight: Pending Review + Active Incidents */}
        <div className={`p-6 rounded-xl border shadow-xs ${cardBg}`}>

          {/* Pending Review section */}
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
              <Inbox className="w-4.5 h-4.5 text-rose-500" />
              Pending Review
            </h2>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${darkMode ? 'bg-rose-950/50 text-rose-400' : 'bg-rose-100 text-rose-700'}`}>
              {pendingReports.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Reports no admin has acted on yet.
          </p>

          <div className="mt-3 space-y-2.5">
            {loadingReports && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading reports...</p>
            )}
            {!loadingReports && reportsError && (
              <p className="text-xs text-rose-500">Unable to load reports right now.</p>
            )}
            {!loadingReports && !reportsError && pendingReports.length === 0 && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No unreviewed reports.</p>
            )}
            {pendingReports.slice(0, 5).map((r) => (
              <div key={r.id} className={`p-2.5 rounded-lg border-l-4 ${pendingRowBorder}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold truncate">{r.id}</span>
                  <span className="text-[11px] font-semibold text-rose-500 shrink-0">{timeAgo(r.submittedAt)}</span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5 truncate capitalize">{r.title}</span>
              </div>
            ))}
          </div>

          {/* Active Incidents section */}
          <div className={`flex items-center justify-between mt-6 pt-5 border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-500" />
              Active Incidents
            </h2>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${darkMode ? 'bg-amber-950/50 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>
              {activeIncidents.length}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            Incidents with a share link, awaiting resolution.
          </p>

          <div className="mt-3 space-y-2.5">
            {loadingLogs && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading incidents...</p>
            )}
            {!loadingLogs && activeIncidents.length === 0 && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No open incidents right now.</p>
            )}
            {activeIncidents.slice(0, 5).map((incident) => (
              <div key={incident.target} className={`p-2.5 rounded-lg border-l-4 ${incidentRowBorder}`}>
                <span className="text-sm font-bold block">{incident.target}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                  By {incident.adminName}
                  {incident.time ? ` • ${formatTimestamp(incident.time)}` : ''}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
}
