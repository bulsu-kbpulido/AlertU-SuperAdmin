import { useState, useEffect } from 'react';
import { Menu, X, Clock, User, ShieldCheck } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { resolveSuperAdminDocId } from '../utils/superAdminDoc';

const PHILIPPINE_TIMEZONE = 'Asia/Manila';

const getInitials = (name) => {
  if (!name) return 'SA';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

export default function Navbar({ activePage, setActivePage, isOpen, setIsOpen }) {
  const [displayName, setDisplayName] = useState('Super Administrator');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [now, setNow] = useState(new Date());

  // 1. Live Philippine Clock Ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Format date and time for Philippine Standard Time
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    timeZone: PHILIPPINE_TIMEZONE,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(now);

  const formattedTime = new Intl.DateTimeFormat('en-US', {
    timeZone: PHILIPPINE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(now);

  // 2. Real-time subscription to SuperAdmin profile document
  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) return undefined;

    let unsubscribeDoc = null;
    let cancelled = false;

    const subscribe = async () => {
      const docId = await resolveSuperAdminDocId(currentUser);
      if (cancelled || !docId) return;

      unsubscribeDoc = onSnapshot(
        doc(db, 'superadmin', docId),
        (snap) => {
          const data = snap.exists() ? snap.data() : null;
          setDisplayName(data?.name || currentUser.displayName || 'Super Administrator');
          setAvatarUrl(data?.avatar || '');
        },
        (error) => {
          console.warn('Navbar snapshot note:', error.message);
          setDisplayName(currentUser.displayName || 'Super Administrator');
        }
      );
    };

    subscribe();
    return () => {
      cancelled = true;
      if (unsubscribeDoc) unsubscribeDoc();
    };
  }, []);

  return (
    <header className="sticky top-0 z-30 w-full border-b border-slate-200/80 bg-white/90 px-4 sm:px-8 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 transition-colors duration-200 font-sans">
      <div className="flex h-20 items-center justify-between gap-4 sm:gap-6">
        
        {/* LEFT: MOBILE MENU TRIGGER, LIVE AVATAR, NAME & REAL-TIME PHILIPPINE CLOCK */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">
          
          {/* Mobile hamburger action */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Toggle Navigation"
          >
            {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          {/* SuperAdmin Profile Info Header */}
          <div 
            onClick={() => setActivePage('profile')}
            className="flex items-center gap-3 cursor-pointer group shrink-0"
            title="Go to Profile Management"
          >
            <div className="relative">
              <div className="flex h-11 w-11 shrink-0 overflow-hidden rounded-full ring-2 ring-blue-500/20 transition-transform group-hover:scale-105 bg-slate-100 dark:bg-slate-800 items-center justify-center font-bold text-sm text-blue-600 dark:text-blue-400">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="aspect-square h-full w-full object-cover" />
                ) : (
                  <span>{getInitials(displayName)}</span>
                )}
              </div>
              <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />
            </div>

            <div className="flex flex-col text-left">
              <span className="text-sm sm:text-base font-medium leading-snug text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate max-w-[140px] sm:max-w-[200px]">
                {displayName}
              </span>
              <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                Super Administrator
              </span>
            </div>
          </div>

          <div className="h-7 w-px bg-slate-200 dark:bg-slate-800 shrink-0 hidden sm:block" />

          {/* DATE & TICKING CLOCK CHIP */}
          <div className="hidden sm:flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-2 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 truncate">
            <span className="truncate">{formattedDate}</span>
            <span className="hidden lg:inline text-slate-300 dark:text-slate-700">•</span>
            <div className="inline-flex items-center gap-1.5 text-blue-600 dark:text-blue-400 bg-blue-50/80 dark:bg-blue-950/50 px-2.5 py-1 rounded-md border border-blue-200/60 dark:border-blue-900/40">
              <Clock className="h-3.5 w-3.5 shrink-0 animate-pulse" />
              <span className="font-mono font-semibold tracking-tight">{formattedTime}</span>
              <span className="text-[10px] font-bold tracking-wider text-blue-500/80 dark:text-blue-400/80 uppercase ml-0.5">
                PST
              </span>
            </div>
          </div>

        </div>

        {/* RIGHT: PROFILE MANAGEMENT PILL SHORTCUT */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActivePage('profile')}
            className={`group relative inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-xs sm:text-sm font-medium transition-all active:scale-[0.98] cursor-pointer outline-none ${
              activePage === 'profile'
                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
            }`}
          >
            <User className="h-4 w-4 shrink-0 transition-transform group-hover:scale-105" />
            <span className="hidden sm:inline">Profile Settings</span>
            <span className="sm:hidden">Profile</span>
          </button>
        </div>

      </div>
    </header>
  );
}