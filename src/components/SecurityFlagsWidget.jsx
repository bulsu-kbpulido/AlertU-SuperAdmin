import { useMemo } from 'react';
import { ShieldAlert, KeyRound, UserX, Lock, ShieldCheck } from 'lucide-react';

// ---- Tunable rules ---------------------------------------------------------
const FAILED_LOGIN_THRESHOLD = 3;                       // attempts...
const FAILED_LOGIN_WINDOW_MS = 24 * 60 * 60 * 1000;     // ...within 24 hours
const INACTIVE_DAYS = 30;
const PASSWORD_RESET_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
// Same rule AdminManagement uses to decide if an account is enabled
const isAccountDisabled = (a) =>
  typeof a.isDisabled === 'boolean'
    ? a.isDisabled
    : String(a.status || '').toLowerCase() === 'disabled';
const MAX_VISIBLE = 6;
const UNAUTH_PLACEHOLDER = 'UNAUTHENTICATED_USER';

const parseDate = (val) => {
  if (!val) return null;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const timeAgo = (date) => {
  if (!date) return '';
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const logTime = (log) =>
  parseDate(log.createdAt) || parseDate(log.timestamp) || parseDate(log.metadata?.attemptedAt);

const actionOf = (log) => String(log.action || '').toUpperCase();

const isLoginFailure = (act) =>
  (act.includes('LOGIN') || act.includes('SIGN_IN') || act.includes('AUTH')) &&
  (act.includes('FAIL') || act.includes('DENIED') || act.includes('INVALID') || act.includes('ERROR'));

const isPasswordReset = (act) =>
  act.includes('PASSWORD') && (act.includes('RESET') || act.includes('FORGOT'));

const nameOf = (a) => a.name || a.displayName || a.fullName || a.email || 'Admin';
const codeOf = (a) => a.adminId || a.adminCode || a.employeeId || null;

const actorKey = (log) =>
  log.adminId || log.adminName || log.performedBy || log.metadata?.email || log.name || null;

const logBelongsTo = (log, admin) =>
  (log.adminId && (log.adminId === admin.id || log.adminId === codeOf(admin))) ||
  (log.adminName && log.adminName === nameOf(admin));

const TYPES = {
  failed_login:   { label: 'Failed logins',   icon: ShieldAlert, tone: 'danger', order: 0 },
  disabled:       { label: 'Account deactivated', icon: Lock,       tone: 'warn',   order: 1 },
  inactive:       { label: 'Inactive',        icon: UserX,       tone: 'warn',   order: 2 },
  password_reset: { label: 'Password reset',  icon: KeyRound,    tone: 'info',   order: 3 },
};

/**
 * Derives security flags from the admins + audit_logs data the Dashboard
 * already subscribes to. No extra Firestore reads.
 */
export function useSecurityFlags(admins, auditLogs) {
  return useMemo(() => {
    const now = Date.now();
    const flags = [];
    const liveAdmins = admins.filter((a) => !a.archived);

    // 1. Disabled accounts (admin doc: isDisabled / status === 'Disabled').
    //    Uses the latest DISABLE_ADMIN_ACCOUNT audit log for the "when".
    liveAdmins.forEach((a) => {
      if (!isAccountDisabled(a)) return;
      let disabledAt = null;
      auditLogs.forEach((log) => {
        if (actionOf(log) !== 'DISABLE_ADMIN_ACCOUNT') return;
        const target = String(log.target || log.targetUser || '');
        if (target !== String(a.adminId || '') && target !== a.email && target !== a.id) return;
        const t = logTime(log);
        if (t && (!disabledAt || t > disabledAt)) disabledAt = t;
      });
      flags.push({
        id: `disabled-${a.id}`,
        type: 'disabled',
        name: nameOf(a),
        code: codeOf(a),
        detail: 'Sign-in access is deactivated',
        at: disabledAt,
        adminId: a.id,
      });
    });

    // 2. Repeated failed logins (from audit_logs).
    //    Failed attempts are logged with adminId "UNAUTHENTICATED_USER" and the
    //    typed email as the target, so we group by email (or a real adminId),
    //    never by the placeholder. Duplicate writes of the same attempt
    //    (same actor, same second) are collapsed into one.
    const emailToAdmin = {};
    admins.forEach((a) => {
      if (a.email) emailToAdmin[String(a.email).trim().toLowerCase()] = a;
    });

    const failures = {};
    const seenAttempts = new Set();
    auditLogs.forEach((log) => {
      if (!isLoginFailure(actionOf(log))) return;
      const t = logTime(log);
      if (!t || now - t.getTime() > FAILED_LOGIN_WINDOW_MS) return;

      const email = String(
        log.target || log.targetUser || log.metadata?.email || log.adminName || ''
      ).trim().toLowerCase();
      const realId = log.adminId && log.adminId !== UNAUTH_PLACEHOLDER ? String(log.adminId) : null;
      const key = realId || email;
      if (!key) return;

      const attemptKey = `${key}|${Math.floor(t.getTime() / 1000)}`;
      if (seenAttempts.has(attemptKey)) return;
      seenAttempts.add(attemptKey);

      if (!failures[key]) failures[key] = { count: 0, latest: t, email, realId };
      failures[key].count += 1;
      if (t > failures[key].latest) failures[key].latest = t;
    });
    Object.entries(failures).forEach(([key, f]) => {
      if (f.count < FAILED_LOGIN_THRESHOLD) return;
      const match = emailToAdmin[f.email] || admins.find((a) => f.realId && codeOf(a) === f.realId);
      flags.push({
        id: `failed-${key}`,
        type: 'failed_login',
        name: match ? nameOf(match) : f.email || key,
        code: match ? codeOf(match) : null,
        detail: `${f.count} failed attempts in the last 24 hours${match ? '' : ' (email not registered)'}`,
        at: f.latest,
      });
    });

    // 3. Inactive for 30+ days. Only flagged when we actually know a last-seen
    //    date, so admins with no tracked login are not falsely reported.
    const disabledIds = new Set(flags.filter((f) => f.type === 'disabled').map((f) => f.adminId));
    liveAdmins.forEach((a) => {
      if (disabledIds.has(a.id)) return;
      let lastSeen = parseDate(
        a.lastLogin || a.lastLoginAt || a.lastSignInTime || a.metadata?.lastSignInTime
      );
      // Admins can stay signed in for days, so any recorded activity by them
      // (not just a login) counts as "seen". Failed attempts do not count.
      auditLogs.forEach((log) => {
        const act = actionOf(log);
        if (isLoginFailure(act) || act.startsWith('SYSTEM_ERROR') || !logBelongsTo(log, a)) return;
        const t = logTime(log);
        if (t && (!lastSeen || t > lastSeen)) lastSeen = t;
      });
      if (!lastSeen) return;
      const days = Math.floor((now - lastSeen.getTime()) / 86400000);
      if (days < INACTIVE_DAYS) return;
      flags.push({
        id: `inactive-${a.id}`,
        type: 'inactive',
        name: nameOf(a),
        code: codeOf(a),
        detail: `No login or activity for ${days} days`,
        at: lastSeen,
      });
    });

    // 4. Recent password resets (from audit_logs), one per admin
    const seenReset = new Set();
    auditLogs.forEach((log) => {
      if (!isPasswordReset(actionOf(log))) return;
      const t = logTime(log);
      if (!t || now - t.getTime() > PASSWORD_RESET_WINDOW_MS) return;
      const key = actorKey(log) || log.id;
      if (seenReset.has(key)) return;
      seenReset.add(key);
      flags.push({
        id: `reset-${key}`,
        type: 'password_reset',
        name: log.adminName || log.performedBy || log.target || log.targetUser || 'Admin',
        code: log.adminId || null,
        detail: 'Password reset in the last 7 days',
        at: t,
      });
    });

    return flags.sort(
      (a, b) =>
        TYPES[a.type].order - TYPES[b.type].order ||
        (b.at?.getTime() || 0) - (a.at?.getTime() || 0)
    );
  }, [admins, auditLogs]);
}

/**
 * Props:
 *  - admins, auditLogs: same arrays used by Dashboard
 *  - loading: true while admins/audit logs are still loading
 *  - darkMode: same boolean prop the Dashboard receives
 *  - onReview(flag): optional. When given, each row shows a "Review" button.
 */
export default function SecurityFlagsWidget({ admins, auditLogs, loading, darkMode, onReview }) {
  const flags = useSecurityFlags(admins, auditLogs);

  const cardBg = darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800';
  const muted = darkMode ? 'text-slate-400' : 'text-slate-500';

  const toneStyles = {
    danger: {
      row: darkMode ? 'border-rose-500 bg-rose-950/30' : 'border-rose-500 bg-rose-50',
      label: 'text-rose-500',
    },
    warn: {
      row: darkMode ? 'border-amber-500 bg-amber-950/30' : 'border-amber-500 bg-amber-50',
      label: 'text-amber-500',
    },
    info: {
      row: darkMode ? 'border-blue-500 bg-blue-950/30' : 'border-blue-500 bg-blue-50',
      label: 'text-blue-500',
    },
  };

  const hasFlags = flags.length > 0;
  const badge = hasFlags
    ? darkMode ? 'bg-rose-950/50 text-rose-400' : 'bg-rose-100 text-rose-700'
    : darkMode ? 'bg-emerald-950/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700';

  return (
    <div className={`p-6 rounded-xl border shadow-xs ${cardBg}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
          <ShieldAlert className="w-4.5 h-4.5 text-rose-500" />
          Security &amp; Account Flags
        </h2>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge}`}>
          {loading ? '...' : flags.length}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1.5">Admin accounts that need your attention.</p>

      <div className="mt-3 space-y-2.5">
        {loading && <p className={`text-sm ${muted}`}>Checking admin accounts...</p>}

        {!loading && !hasFlags && (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <ShieldCheck className="w-7 h-7 text-emerald-500" />
            <p className={`text-sm ${muted}`}>No flagged accounts. All admin accounts look healthy.</p>
          </div>
        )}

        {!loading &&
          flags.slice(0, MAX_VISIBLE).map((f) => {
            const t = TYPES[f.type];
            const Icon = t.icon;
            const tone = toneStyles[t.tone];
            return (
              <div key={f.id} className={`p-2.5 rounded-lg border-l-4 ${tone.row}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold flex items-center gap-1.5 ${tone.label}`}>
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </span>
                  <span className="text-xs font-semibold text-slate-400 shrink-0">{timeAgo(f.at)}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className="text-sm font-bold truncate">{f.name}</span>
                  {f.code && (
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                      {f.code}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 mt-0.5">
                  <span className={`text-xs ${muted}`}>{f.detail}</span>
                  {onReview && (
                    <button
                      type="button"
                      onClick={() => onReview(f)}
                      className={`text-xs font-bold px-2.5 py-1 rounded-md border shrink-0 transition-colors ${
                        darkMode
                          ? 'border-slate-700 hover:bg-slate-800'
                          : 'border-slate-300 bg-white hover:bg-slate-100'
                      }`}
                    >
                      Review
                    </button>
                  )}
                </div>
              </div>
            );
          })}

        {!loading && flags.length > MAX_VISIBLE && (
          <p className={`text-xs text-center ${muted}`}>+{flags.length - MAX_VISIBLE} more flagged</p>
        )}
      </div>
    </div>
  );
}
