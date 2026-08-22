import { useState, useEffect, useRef } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import toast from 'react-hot-toast';
import { auth, db } from './firebase';
import { useIdleTimer } from './hooks/useIdleTimer';
import { resolveSuperAdminDocId } from './utils/superAdminDoc';
import { useAuditLog } from './useAuditLog';
import LoginPage from './LoginPage';
import Sidebar from './components/Sidebar';
import Navbar from './components/Navbar';
import Dashboard from './pages/Dashboard';
import AdminManagement from './pages/AdminManagement';
import ProfileManagement from './pages/ProfileManagement';
import AuditLogs from './pages/AuditLogs';

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [activePage, setActivePage] = useState('dashboard');
  
  // Theme state matching AlertU-Admin pattern: check 'theme' in localStorage with OS preference fallback
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || 
      (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(0);

  const { logLoginSuccess } = useAuditLog();
  const hasLoggedSessionRef = useRef(false);

  // Apply dark class to <html> root element whenever darkMode changes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setCheckingAuth(false);

      if (currentUser && !hasLoggedSessionRef.current) {
        hasLoggedSessionRef.current = true;
        try {
          const docId = await resolveSuperAdminDocId(currentUser);
          if (docId) {
            await updateDoc(doc(db, 'superadmin', docId), {
              lastLogin: serverTimestamp(),
              lastLoginAt: new Date().toISOString(),
            });
          }
          await logLoginSuccess({
            uid: currentUser.uid,
            email: currentUser.email,
            name: currentUser.displayName || currentUser.email,
          });
        } catch (logErr) {
          console.warn('Could not record SuperAdmin login audit log:', logErr);
        }
      } else if (!currentUser) {
        hasLoggedSessionRef.current = false;
      }
    });
    return () => unsubscribe();
  }, [logLoginSuccess]);

  // Listen to global session settings in Firestore when authenticated
  useEffect(() => {
    if (!user) return undefined;
    const unsubscribe = onSnapshot(
      doc(db, 'settings', 'global'),
      (snap) => {
        setSessionTimeoutMinutes(snap.exists() ? Number(snap.data().sessionTimeoutMinutes) || 0 : 0);
      },
      (error) => {
        console.warn('Could not fetch global settings:', error.message);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Unified sign-out handler
  const handleSignOut = async () => {
    try {
      localStorage.removeItem('adminToken');
      localStorage.removeItem('authToken');
      sessionStorage.removeItem('adminToken');
      hasLoggedSessionRef.current = false;
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out failed:', error);
    }
  };

  // Auto sign-out on inactivity if session timeout is configured
  useIdleTimer(user ? sessionTimeoutMinutes : 0, () => {
    handleSignOut();
    toast.error("You've been signed out due to inactivity.");
  });

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard darkMode={darkMode} />;
      case 'admins':
        return <AdminManagement darkMode={darkMode} />;
      case 'profile':
        return <ProfileManagement darkMode={darkMode} setDarkMode={setDarkMode} />;
      case 'logs':
        return <AuditLogs darkMode={darkMode} />;
      default:
        return <Dashboard darkMode={darkMode} />;
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-[#0D47A1]">
        <p className="text-white text-sm font-medium">Loading...</p>
      </div>
    );
  }

  // Render LoginPage if user is not authenticated via Firebase Auth
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className={`flex h-screen w-full overflow-hidden transition-colors duration-200 ${
      darkMode ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      
      <Sidebar 
        activePage={activePage} 
        setActivePage={setActivePage} 
        darkMode={darkMode} 
        setDarkMode={setDarkMode}
        isOpen={isMobileSidebarOpen}
        setIsOpen={setIsMobileSidebarOpen}
        onSignOut={handleSignOut}
      />

      <div className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden">
        
        <Navbar 
          darkMode={darkMode} 
          activePage={activePage} 
          setActivePage={setActivePage}
          isOpen={isMobileSidebarOpen}
          setIsOpen={setIsMobileSidebarOpen}
          onSignOut={handleSignOut}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {renderPage()}
        </main>

      </div>

    </div>
  );
}