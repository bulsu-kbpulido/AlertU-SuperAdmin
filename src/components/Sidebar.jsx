import React from 'react';
import { flushSync } from 'react-dom';
import {
  LayoutDashboard,
  Users,
  FileText,
  UserCheck,
  LogOut,
  Moon,
  Sun,
  ShieldCheck,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import toast from 'react-hot-toast';

export default function Sidebar({
  activePage = 'dashboard',
  setActivePage,
  darkMode,
  setDarkMode,
  isOpen = false,
  setIsOpen,
  onSignOut,
}) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'admins', label: 'Admin Management', icon: Users },
    { id: 'logs', label: 'Audit Logs', icon: FileText },
  ];

  const handleLogout = async () => {
    if (onSignOut) {
      await onSignOut();
      return;
    }
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Failed to log out. Please try again.');
    }
  };

  // Smooth Circular View Transition Theme Toggle matching AlertU-Admin
  const handleThemeToggle = (e) => {
    const isDark = !darkMode;

    if (!document.startViewTransition) {
      setDarkMode(isDark);
      return;
    }

    const x = e.clientX;
    const y = e.clientY;

    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const transition = document.startViewTransition(() => {
      flushSync(() => {
        setDarkMode(isDark);
        if (isDark) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      });
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      document.documentElement.animate(
        { clipPath },
        {
          duration: 450,
          easing: 'ease-in-out',
          pseudoElement: '::view-transition-new(root)',
        }
      );
    });
  };

  const handleItemClick = (targetId) => {
    if (setActivePage) {
      setActivePage(targetId);
    }
    if (setIsOpen) {
      setIsOpen(false);
    }
  };

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200/80 bg-white text-slate-600 transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 md:static md:translate-x-0 md:h-screen shrink-0 ${
          isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* BRAND HEADER */}
        <div className="flex h-20 items-center justify-between border-b border-slate-100 px-4 dark:border-slate-800/80">
          <div className="flex items-center gap-0 min-w-0 shrink-0">
            <img
              src="/logo1.png"
              alt="Logo Icon"
              className="h-12 w-auto object-contain shrink-0"
            />
            <img
              src="/AlertU.png"
              alt="AlertU"
              className="h-16 w-auto object-contain shrink-0"
            />
          </div>

          <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wider text-[10px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40 shrink-0">
            <ShieldCheck className="h-3 w-3" />
            Super Admin
          </span>
        </div>

        {/* NAVIGATION DIRECTORY */}
        <nav className="flex-1 space-y-1.5 overflow-y-auto px-3 py-5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`group relative flex w-full items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-semibold tracking-wide transition-all outline-none duration-200 cursor-pointer overflow-hidden ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-xs dark:bg-blue-500/10 dark:text-blue-400'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-2.5 h-6 w-1 rounded-r-full bg-blue-600 dark:bg-blue-500" />
                )}

                <Icon
                  className={`h-5 w-5 shrink-0 transition-transform duration-150 ${
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                  }`}
                />

                <span className="truncate whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* FOOTER ACTION PILLS */}
        <div className="space-y-1.5 border-t border-slate-100 p-3 dark:border-slate-800/80">
          <button
            onClick={handleThemeToggle}
            className="flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-600 transition-all cursor-pointer hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-100 outline-none whitespace-nowrap"
          >
            {darkMode ? (
              <Sun className="h-4.5 w-4.5 text-amber-500 shrink-0" />
            ) : (
              <Moon className="h-4.5 w-4.5 text-slate-400 shrink-0" />
            )}
            <span>{darkMode ? 'Light Theme' : 'Dark Theme'}</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-xs font-semibold text-rose-600 transition-all cursor-pointer hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30 outline-none whitespace-nowrap"
          >
            <LogOut className="h-4.5 w-4.5 shrink-0" />
            <span>Logout Session</span>
          </button>
        </div>
      </aside>

      {/* MOBILE BACKDROP OVERLAY */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-xs transition-opacity"
        />
      )}
    </>
  );
}