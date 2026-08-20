import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { auth, db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import Logo1 from '../assets/logo1.png';
import { resolveSuperAdminDocId } from '../utils/superAdminDoc';

const getInitials = (name) => {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
};

export default function Navbar({ darkMode, activePage, setActivePage, isOpen, setIsOpen }) {
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  const pageTitles = {
    dashboard: 'Dashboard',
    admins: 'Admin Modification',
    logs: 'Audit Logs',
    settings: 'Settings',
    profile: 'Profile Management',
  };

  // Live subscription to the logged-in superadmin's own document, so the
  // initials/avatar update immediately if changed in Profile Management —
  // no page refresh needed. Resolves the doc ID with the same logic
  // ProfileManagement.jsx uses (email lookup, uid fallback) instead of
  // assuming the doc ID equals the Auth uid — that mismatch was why this
  // badge previously never reflected saved changes.
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
          setDisplayName(data?.name || currentUser.displayName || currentUser.email || '');
          setAvatarUrl(data?.avatar || '');
        },
        (error) => {
          console.error('Failed to load superadmin profile for navbar:', error);
          setDisplayName(currentUser.displayName || currentUser.email || '');
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
    <header className={`
      h-16 w-full border-b flex items-center justify-between px-4 md:px-6 sticky top-0 z-20 backdrop-blur-md transition-all duration-200
      ${darkMode ? 'bg-slate-900/80 border-slate-800 text-slate-100' : 'bg-white/80 border-slate-200 text-slate-800'}
    `}>
      
      {/* LEFT ASPECT: Brand on Mobile / Page Title on Desktop */}
      <div className="flex items-center gap-4">
        {/* Mobile menu trigger hamburger action button */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`md:hidden p-2 rounded-lg transition-colors cursor-pointer border ${
            darkMode ? 'border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-slate-100' : 'border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-800'
          }`}
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* Small branding anchor explicitly shown on mobile screen blocks */}
        <div className="flex md:hidden items-center gap-2">
          <img src={Logo1} alt="AlertU" className="w-6 h-6 object-contain" />
          <span className="font-extrabold tracking-tight text-md bg-gradient-to-r from-indigo-600 to-blue-500 dark:from-indigo-400 dark:to-blue-400 bg-clip-text text-transparent">
            AlertU
          </span>
        </div>

        <h2 className="hidden md:block text-xs font-semibold uppercase tracking-widest font-mono text-slate-500 dark:text-slate-400">
          {pageTitles[activePage] || 'AlertU Console'}
        </h2>
      </div>

      {/* RIGHT ASPECT: Utilities layout tools */}
      <div className="flex items-center gap-3">
        

        <div className={`w-px h-5 hidden sm:block ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`} />

        {/* User avatar — clicking navigates straight to Profile Management */}
        <button
          onClick={() => setActivePage('profile')}
          title="Profile Management"
          className={`flex items-center gap-1.5 p-1.5 rounded-xl transition-all cursor-pointer text-left border ${
            activePage === 'profile'
              ? (darkMode ? 'bg-slate-800 border-slate-700' : 'bg-slate-100 border-slate-200')
              : 'hover:bg-slate-100 dark:hover:bg-slate-800 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
          }`}
        >
          <div className="w-7 h-7 rounded-lg overflow-hidden bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-md shadow-indigo-600/10">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              getInitials(displayName)
            )}
          </div>
        </button>

      </div>
    </header>
  );
}