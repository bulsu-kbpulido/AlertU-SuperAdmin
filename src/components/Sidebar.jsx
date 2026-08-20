import React from 'react';
import { LayoutDashboard, Users, FileText, LogOut, Moon, Sun } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import toast from 'react-hot-toast';
import Logo1 from '../assets/logo1.png';

export default function Sidebar({ activePage, setActivePage, darkMode, setDarkMode, isOpen, setIsOpen }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'admins', label: 'Admin Management', icon: Users },
    { id: 'logs', label: 'Audit Logs', icon: FileText },
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
      toast.error('Failed to log out. Please try again.');
    }
  };

  return (
    <>
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-[#0D47A1] text-slate-100 flex flex-col justify-between
        transform transition-transform duration-300 ease-in-out shadow-2xl border-r border-white/10
        md:translate-x-0 md:static md:h-screen shrink-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        
        <div>
          <div className="h-16 flex items-center gap-3.5 px-6 border-b border-white/10">
            <div className="w-9 h-9 bg-white p-1 rounded-lg shadow-md flex items-center justify-center overflow-hidden shrink-0">
              <img src={Logo1} alt="AlertU System Brand" className="w-full h-full object-contain" />
            </div>
            <div className="flex flex-col">
              <span className="font-black italic text-lg tracking-tight leading-none text-white">Alert U</span>
              <span className="text-[10px] uppercase tracking-widest font-bold text-blue-200 mt-1">Super-Admin</span>
            </div>
          </div>

          <nav className="mt-6 px-4 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => { setActivePage(item.id); setIsOpen(false); }}
                  className={`
                    w-full flex items-center gap-3.5 px-4 py-3 rounded-lg text-sm font-semibold transition-all duration-150 cursor-pointer group
                    ${isActive 
                      ? 'bg-white text-[#0D47A1] shadow-md font-bold' 
                      : 'text-slate-200 hover:bg-white/10 hover:text-white'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-[#0D47A1]' : 'text-slate-300 group-hover:text-white'}`} />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-white/10 space-y-2">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className="w-full flex items-center gap-3.5 px-4 py-3 rounded-lg text-sm font-medium text-slate-200 hover:bg-white/10 transition-colors cursor-pointer"
          >
            {darkMode ? (
              <>
                <Sun className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Light Mode</span>
              </>
            ) : (
              <>
                <Moon className="w-5 h-5 text-slate-300 shrink-0" />
                <span>Dark Mode</span>
              </>
            )}
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3.5 px-4 py-3 rounded-lg text-sm font-medium text-red-200 hover:bg-red-600/20 hover:text-red-100 transition-colors cursor-pointer group"
          >
            <LogOut className="w-5 h-5 text-red-300 group-hover:text-red-100 shrink-0" />
            <span>Log Out</span>
          </button>
        </div>

      </aside>

      {isOpen && (
        <div onClick={() => setIsOpen(false)} className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-xs" />
      )}
    </>
  );
}