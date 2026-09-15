import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  UserPlus, 
  RefreshCw, 
  Search, 
  Users, 
  Archive, 
  Eye, 
  Edit3, 
  FolderArchive, 
  ChevronLeft, 
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  UserX,
  Loader2,
  AlertTriangle,
  Wifi,
  WifiOff
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { collection, onSnapshot, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { socket, joinSocketRoom } from '../socket';
import { fetchFromBackend } from '../api';
import { useAuditLog } from '../useAuditLog';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

// Modular Action Modals matching AlertU-Admin citizen_utilities pattern
import Create_Admin from '../admin_utilities/Create_Admin';
import View_Admin from '../admin_utilities/View_Admin';
import Edit_Admin from '../admin_utilities/Edit_Admin';
import Archive_Admin from '../admin_utilities/Archive_Admin';
import StatusToggleAlertDialog from '../admin_utilities/StatusToggleAlertDialog';
import ArchivedAdminsTable from '../admin_utilities/ArchivedAdminsTable';

// Helper: Extract unique ID
const getAdminId = (a) => a?.adminId || a?.id || a?.uid;

// Helper: Extract initials for avatar fallback
const getInitials = (name) => {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
};

const checkIsAccountEnabled = (admin) => {
  if (!admin) return false;
  if (typeof admin.isDisabled === 'boolean') {
    return !admin.isDisabled;
  }
  return admin.status !== 'Disabled' && admin.status !== 'disabled';
};

// --- Framer Motion Live Presence Indicator matching AlertU-Admin ---
const PresenceBadge = ({ isActive }) => {
  return (
    <div className="relative flex items-center h-7 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {isActive ? (
          <motion.span
            key="online-badge"
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
          >
            <span className="relative flex h-2 w-2">
              <motion.span
                animate={{ scale: [1, 2, 1], opacity: [0.7, 0, 0.7] }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
              />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <Wifi className="h-3 w-3" />
            Online
          </motion.span>
        ) : (
          <motion.span
            key="offline-badge"
            initial={{ opacity: 0, y: 6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
          >
            <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
            <WifiOff className="h-3 w-3" />
            Offline
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
};

// --- Shadcn Style Table Loading Skeleton matching AlertU-Admin ---
const TableSkeleton = () => {
  return (
    <div className="w-full">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between p-4 space-x-4 animate-pulse">
            <div className="h-7 bg-slate-200 dark:bg-slate-700/80 rounded-md w-24"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 dark:bg-slate-700/80 rounded w-1/4"></div>
              <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-1/3"></div>
            </div>
            <div className="h-6 bg-slate-200 dark:bg-slate-700/80 rounded-full w-20"></div>
            <div className="h-6 bg-slate-200 dark:bg-slate-700/80 rounded-md w-28"></div>
            <div className="h-6 bg-slate-200 dark:bg-slate-700/80 rounded-full w-16"></div>
            <div className="flex items-center space-x-2">
              <div className="h-8 bg-slate-200 dark:bg-slate-700/80 rounded-md w-14"></div>
              <div className="h-8 bg-slate-200 dark:bg-slate-700/80 rounded-md w-14"></div>
              <div className="h-8 bg-slate-200 dark:bg-slate-700/80 rounded-md w-16"></div>
              <div className="h-8 bg-slate-200 dark:bg-slate-700/80 rounded-md w-16"></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function AdminManagement({ darkMode }) {
  useDocumentTitle('Manage Admins – AlertU');

  const { logMovement } = useAuditLog();

  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'archived'
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Real-time online presences map (uid/adminId -> boolean)
  const [onlinePresences, setOnlinePresences] = useState({});

  // Modals state
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [modals, setModals] = useState({
    create: false,
    view: false,
    edit: false,
    archive: false,
  });

  const [toggleDialog, setToggleDialog] = useState({
    isOpen: false,
    admin: null,
  });

  // Fast, explicit refresh from Firestore
  const handleRefresh = useCallback(async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const snap = await getDocs(collection(db, 'admins'));
      const adminList = snap.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setAdmins(adminList);
      if (!silent) {
        toast.success('Admin directory up to date.', { id: 'refresh-admins', duration: 1500 });
      }
    } catch (error) {
      console.error('Error refreshing administrators from Firestore:', error);
      if (!silent) {
        toast.error('Failed to refresh administrator records.');
      }
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  }, []);

  // 1. Sync administrators live from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'admins'),
      (snapshot) => {
        const adminList = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }));
        setAdmins(adminList);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching administrators from Firestore:', error);
        toast.error('Failed to sync administrator records.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Real-time Socket.IO Presence Listener
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      joinSocketRoom('admins');
      joinSocketRoom('super_admins');
    };

    if (socket.connected) {
      joinSocketRoom('admins');
      joinSocketRoom('super_admins');
    }

    socket.on('connect', handleConnect);

    const handlePresenceEvent = (data) => {
      if (!data) return;
      const targetId = String(data.uid || data.adminId || data.authUid || data.id || '');
      const isOnline = typeof data.isActive === 'boolean' 
        ? data.isActive 
        : data.isOnline === true || data.status === 'Online';

      if (targetId) {
        setOnlinePresences((prev) => ({
          ...prev,
          [targetId]: isOnline,
        }));
      }
    };

    socket.on('admin_presence_changed', handlePresenceEvent);
    socket.on('citizen_presence_changed', handlePresenceEvent);
    socket.on('user_online', (d) => handlePresenceEvent({ ...d, isActive: true }));
    socket.on('user_offline', (d) => handlePresenceEvent({ ...d, isActive: false }));

    return () => {
      socket.off('connect', handleConnect);
      socket.off('admin_presence_changed', handlePresenceEvent);
      socket.off('citizen_presence_changed', handlePresenceEvent);
      socket.off('user_online');
      socket.off('user_offline');
    };
  }, []);

  const openModal = (type, admin = null) => {
    setSelectedAdmin(admin);
    setModals((prev) => ({ ...prev, [type]: true }));

    if (type === 'view' && admin) {
      logMovement({
        action: 'VIEW_ADMIN_PROFILE',
        target: admin.adminId || admin.email || admin.id,
        details: `Super Admin viewed administrator profile for ${admin.name || admin.email}`,
      });
    }
  };

  const closeModal = (type) => {
    setModals((prev) => ({ ...prev, [type]: false }));
    if (type !== 'create') setSelectedAdmin(null);
  };

  // Status toggle handler
  const triggerStatusConfirm = (admin) => {
    setToggleDialog({ isOpen: true, admin });
  };

  const confirmToggleStatus = async () => {
    const admin = toggleDialog.admin;
    if (!admin) return;

    const adminId = admin.id;
    const currentlyActive = checkIsAccountEnabled(admin);
    const nextIsDisabled = currentlyActive;
    const nextStatus = currentlyActive ? 'Disabled' : 'Active';

    try {
      setActionLoadingId(adminId);

      // 1. Synchronize with backend to disable at Firebase Auth level & notify active session
      try {
        await fetchFromBackend('admin/toggle-status', {
          method: 'POST',
          body: JSON.stringify({
            uid: admin.uid || adminId,
            isDisabled: nextIsDisabled,
            status: nextStatus,
          }),
        });
      } catch (backendErr) {
        console.warn('Backend toggle status warning (fallback to Firestore):', backendErr.message);
      }

      // 2. Direct Firestore update for immediate local reflection
      const adminRef = doc(db, 'admins', adminId);
      await updateDoc(adminRef, {
        isDisabled: nextIsDisabled,
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });

      await logMovement({
        action: nextIsDisabled ? 'DISABLE_ADMIN_ACCOUNT' : 'ENABLE_ADMIN_ACCOUNT',
        target: admin.adminId || admin.email || adminId,
        details: `${nextIsDisabled ? 'Disabled' : 'Reactivated'} access for administrator ${admin.name || admin.email}`,
      });

      toast.success(`Administrator account ${nextIsDisabled ? 'disabled' : 'enabled'} successfully.`);
      setToggleDialog({ isOpen: false, admin: null });
    } catch (err) {
      console.error('Failed to toggle admin status:', err);
      toast.error('Failed to update account status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Safe Search & Multi-Filter Logic
  const filteredAdmins = useMemo(() => {
    return admins.filter((admin) => {
      const matchesTab = activeTab === 'archived' ? admin.archived === true : !admin.archived;
      if (!matchesTab) return false;

      const isAccountEnabled = checkIsAccountEnabled(admin);
      const isOnline = Boolean(
        onlinePresences[admin.id] ?? 
        onlinePresences[admin.uid] ?? 
        onlinePresences[admin.adminId] ?? 
        admin.isActive ?? 
        admin.isOnline
      );

      if (statusFilter === 'Active' && !isAccountEnabled) return false;
      if (statusFilter === 'Disabled' && isAccountEnabled) return false;
      if (statusFilter === 'Online' && !isOnline) return false;
      if (statusFilter === 'Offline' && isOnline) return false;

      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;

      return (
        admin.name?.toLowerCase().includes(term) ||
        admin.email?.toLowerCase().includes(term) ||
        admin.adminId?.toLowerCase().includes(term) ||
        admin.phone?.toLowerCase().includes(term)
      );
    });
  }, [admins, activeTab, statusFilter, searchTerm, onlinePresences]);

  // Reset page when search, tab, or filter updates
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, statusFilter]);

  const totalPages = Math.ceil(filteredAdmins.length / itemsPerPage) || 1;

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedAdmins = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAdmins.slice(start, start + itemsPerPage);
  }, [filteredAdmins, currentPage, itemsPerPage]);

  const activeCount = admins.filter((a) => !a.archived).length;
  const archivedCount = admins.filter((a) => a.archived).length;

  const filterOptions = [
    { label: 'All', value: 'ALL' },
    { label: 'Online', value: 'Online' },
    { label: 'Offline', value: 'Offline' },
    { label: 'Active', value: 'Active' },
    { label: 'Disabled', value: 'Disabled' },
  ];

  return (
    <div className="w-full font-sans text-slate-900 dark:text-slate-100 transition-colors duration-200">
      <Toaster 
        position="top-right" 
        toastOptions={{
          style: darkMode 
            ? { background: '#0f172a', color: '#fff', border: '1px solid #1e293b' } 
            : { background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0' }
        }}
      />

      {/* Header matching AlertU-Admin Citizen Directory */}
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Admin Directory</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage registered administrator accounts, monitor online presence, and adjust profile parameters.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openModal('create')}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-blue-700 focus:outline-none transition-colors cursor-pointer"
          >
            <UserPlus className="h-4 w-4" />
            Register Admin
          </button>
          <button
            onClick={() => handleRefresh(false)}
            disabled={isRefreshing}
            className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </header>

      {/* Main Card Wrapper */}
      <div className="w-full rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
        
        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 px-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'active'
                ? 'border-blue-600 bg-white text-blue-600 dark:bg-slate-900 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Users className="h-4 w-4" />
            Active Accounts
            <span className="ml-1 rounded-full bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              {activeCount}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('archived')}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-3.5 text-sm font-medium transition-colors cursor-pointer ${
              activeTab === 'archived'
                ? 'border-blue-600 bg-white text-blue-600 dark:bg-slate-900 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <Archive className="h-4 w-4" />
            Archived Vault
            <span className="ml-1 rounded-full bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
              {archivedCount}
            </span>
          </button>
        </div>

        {/* Toolbar Controls */}
        <div className="flex flex-col gap-4 border-b border-slate-200 dark:border-slate-800 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-lg">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              aria-label="Search administrators"
              placeholder="Search by Admin ID, full name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-white pl-9 pr-4 py-2 text-sm placeholder-slate-400 dark:placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Button Group / Segmented Control Filter */}
          {activeTab === 'active' && (
            <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/80">
              {filterOptions.map((opt) => {
                const isSelected = statusFilter === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatusFilter(opt.value)}
                    className={`relative px-3 py-1.5 text-xs font-medium rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer ${
                      isSelected
                        ? 'text-slate-900 dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {isSelected && (
                      <motion.div
                        layoutId="activeAdminFilterPill"
                        className="absolute inset-0 bg-white dark:bg-slate-900 rounded-md shadow-sm border border-slate-200/60 dark:border-slate-700/60"
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Table Content Switcher */}
        {activeTab === 'archived' ? (
          <ArchivedAdminsTable
            admins={admins}
            loading={loading}
            searchTerm={searchTerm}
            onViewAdmin={(admin) => openModal('view', admin)}
            onRefresh={() => handleRefresh(true)}
          />
        ) : loading ? (
          <TableSkeleton />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="px-6 py-4">Admin ID</th>
                  <th className="px-6 py-4">Administrator</th>
                  <th className="px-6 py-4">Presence</th>
                  <th className="px-6 py-4">Phone Number</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {paginatedAdmins.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400">
                      <Users className="mx-auto h-8 w-8 text-slate-400 dark:text-slate-600 mb-2" />
                      No administrator records match your selected criteria.
                    </td>
                  </tr>
                ) : (
                  paginatedAdmins.map((admin) => {
                    const isAccountEnabled = checkIsAccountEnabled(admin);
                    const isActionBusy = actionLoadingId === admin.id;
                    const isOnline = Boolean(
                      onlinePresences[admin.id] ?? 
                      onlinePresences[admin.uid] ?? 
                      onlinePresences[admin.adminId] ?? 
                      admin.isActive ?? 
                      admin.isOnline
                    );

                    return (
                      <tr key={admin.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        {/* Admin ID */}
                        <td className="px-6 py-4">
                          <span className="inline-block rounded-md bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-sm font-mono font-bold tracking-wide text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700/80">
                            {admin.adminId || 'ID Pending'}
                          </span>
                        </td>

                        {/* Full Name & Avatar */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3.5">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden ${admin.avatarBg || 'bg-slate-500'}`}>
                              {admin.avatar ? (
                                <img src={admin.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                getInitials(admin.name)
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-slate-100">{admin.name || 'Unnamed Record'}</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">{admin.email}</div>
                            </div>
                          </div>
                        </td>

                        {/* Live Presence Indicator */}
                        <td className="px-6 py-4">
                          <PresenceBadge isActive={isOnline} />
                        </td>

                        {/* Phone Number */}
                        <td className="px-6 py-4 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {admin.phone || '—'}
                        </td>

                        {/* Status Badge */}
                        <td className="px-6 py-4">
                          {isAccountEnabled ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/40 dark:text-green-400 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                              <ShieldCheck className="h-3 w-3" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                              <ShieldAlert className="h-3 w-3" />
                              Disabled
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="inline-flex items-center justify-end gap-2">
                            {/* View Button */}
                            <button
                              onClick={() => openModal('view', admin)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </button>

                            {/* Edit Button */}
                            <button
                              onClick={() => openModal('edit', admin)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer"
                            >
                              <Edit3 className="h-3.5 w-3.5" /> Edit
                            </button>

                            {/* Enable/Disable Toggle */}
                            <button
                              onClick={() => triggerStatusConfirm(admin)}
                              disabled={isActionBusy}
                              className={`inline-flex items-center gap-1 w-[82px] justify-center rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                                isAccountEnabled
                                  ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-900/60'
                                  : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60'
                              }`}
                            >
                              {isActionBusy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : isAccountEnabled ? (
                                <>
                                  <UserX className="h-3.5 w-3.5" /> Disable
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" /> Enable
                                </>
                              )}
                            </button>

                            {/* Archive Button */}
                            <button
                              onClick={() => openModal('archive', admin)}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-400 dark:hover:bg-red-900/60 px-2.5 py-1.5 text-xs font-medium text-red-700 shadow-sm hover:bg-red-100 transition-colors cursor-pointer"
                            >
                              <FolderArchive className="h-3.5 w-3.5" /> Archive
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls for Active Tab */}
        {activeTab === 'active' && !loading && filteredAdmins.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50 px-6 py-4 gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{Math.min(currentPage * itemsPerPage, filteredAdmins.length)}</span> of{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">{filteredAdmins.length}</span> records
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </button>
              <span className="text-xs text-slate-600 dark:text-slate-400 px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer"
              >
                Next <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Action Modals */}
      <Create_Admin
        isOpen={modals.create}
        onClose={() => closeModal('create')}
        onRefresh={() => handleRefresh(true)}
      />

      <View_Admin
        isOpen={modals.view}
        admin={selectedAdmin}
        onClose={() => closeModal('view')}
        isOnline={selectedAdmin ? Boolean(
          onlinePresences[selectedAdmin.id] ?? 
          onlinePresences[selectedAdmin.uid] ?? 
          onlinePresences[selectedAdmin.adminId] ?? 
          selectedAdmin.isActive ?? 
          selectedAdmin.isOnline
        ) : false}
      />

      <Edit_Admin
        isOpen={modals.edit}
        admin={selectedAdmin}
        onClose={() => closeModal('edit')}
        onRefresh={() => handleRefresh(true)}
      />

      <Archive_Admin
        isOpen={modals.archive}
        admin={selectedAdmin}
        onClose={() => closeModal('archive')}
        onRefresh={() => handleRefresh(true)}
      />

      {/* Enable / Disable Confirmation Dialog */}
      <StatusToggleAlertDialog
        isOpen={toggleDialog.isOpen}
        admin={toggleDialog.admin}
        isCurrentlyActive={toggleDialog.admin ? checkIsAccountEnabled(toggleDialog.admin) : false}
        loading={actionLoadingId === toggleDialog.admin?.id}
        onConfirm={confirmToggleStatus}
        onClose={() => setToggleDialog({ isOpen: false, admin: null })}
      />

    </div>
  );
}
