import { useEffect, useState } from 'react';
import { Activity, Users, UserCheck, Clock, FileText, Building2 } from 'lucide-react';
import { db } from '../firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';

function getDepartmentMeta(department, darkMode) {
  const dep = (department || '').toUpperCase();

  if (dep.includes('BFP')) {
    return { label: 'BFP', color: darkMode ? 'text-red-400 bg-red-950/40 border-red-500' : 'text-red-600 bg-red-50 border-red-500' };
  }
  if (dep.includes('PNP') || dep.includes('PP') || dep.includes('PULIS')) {
    return { label: 'PNP', color: darkMode ? 'text-blue-400 bg-blue-950/40 border-blue-500' : 'text-blue-600 bg-blue-50 border-blue-500' };
  }
  if (dep.includes('RHU')) {
    return { label: 'RHU', color: darkMode ? 'text-emerald-400 bg-emerald-950/40 border-emerald-500' : 'text-emerald-600 bg-emerald-50 border-emerald-500' };
  }
  if (dep.includes('MDRRMO')) {
    return { label: 'MDRRMO', color: darkMode ? 'text-amber-400 bg-amber-950/40 border-amber-500' : 'text-amber-600 bg-amber-50 border-amber-500' };
  }
  if (dep.includes('BARANGAY')) {
    return { label: 'Barangay Officials', color: darkMode ? 'text-purple-400 bg-purple-950/40 border-purple-500' : 'text-purple-600 bg-purple-50 border-purple-500' };
  }
  return { label: department || 'Unassigned', color: darkMode ? 'text-slate-400 bg-slate-800/40 border-slate-500' : 'text-slate-600 bg-slate-50 border-slate-400' };
}

export default function Dashboard({ darkMode }) {
  const [admins, setAdmins] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  useEffect(() => {
    const adminsQuery = query(collection(db, 'admins'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      adminsQuery,
      (snapshot) => {
        setAdmins(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoadingAdmins(false);
      },
      (error) => {
        console.error('Error fetching admins:', error);
        setLoadingAdmins(false);
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const logsQuery = query(
      collection(db, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(8)
    );
    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => {
        setAuditLogs(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
        setLoadingLogs(false);
      },
      (error) => {
        console.error('Error fetching audit logs:', error);
        setLoadingLogs(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const totalAdmins = admins.length;
  const activeAdmins = admins.filter((a) => a.status === 'active').length;

  const roleCounts = admins.reduce((acc, admin) => {
    const { label } = getDepartmentMeta(admin.department, darkMode);
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  const lastLoginAdmin = admins.reduce((latest, admin) => {
    if (!admin.lastLogin?.toDate) return latest;
    if (!latest || admin.lastLogin.toDate() > latest.lastLogin.toDate()) return admin;
    return latest;
  }, null);

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
      value: loadingAdmins
        ? '...'
        : lastLoginAdmin
        ? lastLoginAdmin.name || 'Unknown'
        : 'No data',
      change: lastLoginAdmin?.lastLogin?.toDate
        ? lastLoginAdmin.lastLogin.toDate().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'No login records yet',
      icon: Clock,
      color: darkMode ? 'border-amber-500 text-amber-400 bg-amber-950/40' : 'border-amber-500 text-amber-600 bg-amber-50',
    },
    {
      label: 'Audit Log Entries',
      value: loadingLogs ? '...' : `${auditLogs.length}`,
      change: 'Most recent activity shown below',
      icon: FileText,
      color: darkMode ? 'border-blue-500 text-blue-400 bg-blue-950/40' : 'border-blue-500 text-blue-600 bg-blue-50',
    },
  ];

  const cardBg = darkMode ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-slate-200 text-slate-800";
  const rowBg = darkMode ? "bg-slate-950/50 border-slate-800 hover:border-slate-700" : "bg-slate-50 border-slate-100 hover:border-slate-300";
  const innerIconBg = darkMode ? "bg-slate-800/80" : "bg-white/80";

  const formatTimestamp = (ts) => {
    if (!ts?.toDate) return '—';
    const date = ts.toDate();
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div key={idx} className={`p-5 rounded-xl border-l-4 shadow-xs flex items-center justify-between ${cardBg} ${stat.color}`}>
              <div className="space-y-1">
                <span className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>{stat.label}</span>
                <h3 className="text-2xl font-black tracking-tight">{stat.value}</h3>
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

        <div className={`p-6 rounded-xl border shadow-xs lg:col-span-2 ${cardBg}`}>
          <div className={`flex items-center justify-between border-b pb-4 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Recent Admin Activity
            </h2>
          </div>

          <div className="mt-4 space-y-3">
            {loadingLogs && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading audit logs...</p>
            )}
            {!loadingLogs && auditLogs.length === 0 && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No audit logs found.</p>
            )}
            {auditLogs.map((log) => (
              <div key={log.id} className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${rowBg}`}>
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <div>
                    <span className="text-sm font-semibold block">{log.action || 'Unknown action'}</span>
                    <span className="text-[11px] text-slate-400">
                      {log.performedBy || 'Unknown'} {log.targetUser ? `→ ${log.targetUser}` : ''}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-xs font-mono font-bold block ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{formatTimestamp(log.timestamp)}</span>
                  <span className="text-[10px] text-slate-400 font-medium uppercase">{log.type || '—'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`p-6 rounded-xl border shadow-xs ${cardBg}`}>
          <div className={`flex items-center justify-between border-b pb-4 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
            <h2 className="text-lg font-bold tracking-tight flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-500" />
              Roles Assigned
            </h2>
          </div>

          <div className="mt-4 space-y-3">
            {loadingAdmins && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading roles...</p>
            )}
            {!loadingAdmins && Object.keys(roleCounts).length === 0 && (
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>No admins assigned yet.</p>
            )}
            {Object.entries(roleCounts).map(([label, count]) => {
              const { color } = getDepartmentMeta(label, darkMode);
              return (
                <div key={label} className={`flex items-center justify-between p-3 rounded-lg border-l-4 ${color}`}>
                  <span className="text-sm font-semibold">{label}</span>
                  <span className="text-sm font-black">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}