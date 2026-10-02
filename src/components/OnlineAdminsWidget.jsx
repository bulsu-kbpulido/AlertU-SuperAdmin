import { useEffect, useMemo, useState } from 'react';
import { Radio } from 'lucide-react';
import { socket, joinSocketRoom } from '../socket';

const MAX_VISIBLE = 6;

const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
};

// Same rule AdminManagement uses to decide if an account is enabled
const isAccountEnabled = (a) =>
  typeof a.isDisabled === 'boolean'
    ? !a.isDisabled
    : String(a.status || '').toLowerCase() !== 'disabled';

/**
 * Live presence map (uid / adminId / id -> boolean), fed by the same
 * Socket.IO events AdminManagement listens to.
 */
function usePresenceMap() {
  const [presence, setPresence] = useState({});

  useEffect(() => {
    if (!socket) return;

    const join = () => {
      joinSocketRoom('admins');
      joinSocketRoom('super_admins');
    };
    if (socket.connected) join();
    socket.on('connect', join);

    const handle = (data) => {
      if (!data) return;
      const id = String(data.uid || data.adminId || data.authUid || data.id || '');
      if (!id) return;
      const isOnline =
        typeof data.isActive === 'boolean'
          ? data.isActive
          : data.isOnline === true || data.status === 'Online';
      setPresence((prev) => ({ ...prev, [id]: isOnline }));
    };
    const onUserOnline = (d) => handle({ ...d, isActive: true });
    const onUserOffline = (d) => handle({ ...d, isActive: false });

    socket.on('admin_presence_changed', handle);
    socket.on('user_online', onUserOnline);
    socket.on('user_offline', onUserOffline);

    return () => {
      socket.off('connect', join);
      socket.off('admin_presence_changed', handle);
      socket.off('user_online', onUserOnline);
      socket.off('user_offline', onUserOffline);
    };
  }, []);

  return presence;
}

/**
 * Props:
 *  - admins: same array the Dashboard already loads from Firestore
 *  - loading: true while admins are loading
 *  - darkMode: same boolean prop the Dashboard receives
 */
export default function OnlineAdminsWidget({ admins, loading, darkMode }) {
  const presence = usePresenceMap();

  const { online, total } = useMemo(() => {
    const eligible = admins.filter((a) => !a.archived && isAccountEnabled(a));
    const isOnline = (a) =>
      Boolean(presence[a.id] ?? presence[a.uid] ?? presence[a.adminId] ?? a.isActive ?? a.isOnline);
    return {
      online: eligible
        .filter(isOnline)
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
      total: eligible.length,
    };
  }, [admins, presence]);

  const cardBg = darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800';
  const muted = darkMode ? 'text-slate-400' : 'text-slate-500';
  const badge = darkMode ? 'bg-emerald-950/50 text-emerald-400' : 'bg-emerald-100 text-emerald-700';

  return (
    <div className={`p-6 rounded-xl border shadow-xs ${cardBg}`}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
          <Radio className="w-4.5 h-4.5 text-emerald-500" />
          Online Admins
        </h2>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge}`}>
          {loading ? '...' : `${online.length} / ${total}`}
        </span>
      </div>
      <p className="text-xs text-slate-400 mt-1.5">Administrators signed in right now.</p>

      <div className="mt-3 space-y-1.5">
        {loading && <p className={`text-sm ${muted}`}>Checking presence...</p>}

        {!loading && online.length === 0 && (
          <p className={`text-sm py-4 text-center ${muted}`}>No admins online right now.</p>
        )}

        {!loading &&
          online.slice(0, MAX_VISIBLE).map((a) => (
            <div
              key={a.id}
              className={`flex items-center gap-3 p-2 rounded-lg ${darkMode ? 'hover:bg-slate-800/60' : 'hover:bg-slate-50'}`}
            >
              <div className="relative shrink-0">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold overflow-hidden ${a.avatarBg || 'bg-slate-500'}`}
                >
                  {a.avatar ? (
                    <img src={a.avatar} alt="" className="w-full h-full object-cover" />
                  ) : (
                    getInitials(a.name)
                  )}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 ${
                    darkMode ? 'border-slate-900' : 'border-white'
                  }`}
                />
              </div>
              <span className="text-sm font-semibold truncate flex-1">{a.name || a.email || 'Admin'}</span>
              {a.adminId && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                  {a.adminId}
                </span>
              )}
            </div>
          ))}

        {!loading && online.length > MAX_VISIBLE && (
          <p className={`text-xs text-center pt-1 ${muted}`}>+{online.length - MAX_VISIBLE} more online</p>
        )}
      </div>
    </div>
  );
}
