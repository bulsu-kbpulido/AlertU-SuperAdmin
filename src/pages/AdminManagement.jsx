import { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, Edit2, Archive, ArchiveRestore, X, User,
  Eye, EyeOff, CheckCircle2, Circle, Loader2, MapPin,
  ArrowUpDown, ArrowUp, ArrowDown, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight
} from 'lucide-react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from '@tanstack/react-table';
import toast, { Toaster } from 'react-hot-toast'; 
import { isValidPhoneNumber } from 'react-phone-number-input';
import { PhoneInput } from '@/components/reui/phone-input';

import { db, auth } from '../firebase'; 
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp
} from 'firebase/firestore';

const API_BASE_URL = 'https://alertu-server.onrender.com';

// Helper: Format raw PH numbers (e.g., "09171234567" -> "+639171234567") for react-phone-number-input
const formatToE164Phone = (phoneNumber) => {
  if (!phoneNumber) return '';
  let cleaned = String(phoneNumber).trim();
  if (cleaned.startsWith('09')) {
    return `+63${cleaned.slice(1)}`;
  }
  if (!cleaned.startsWith('+') && cleaned.startsWith('63')) {
    return `+${cleaned}`;
  }
  return cleaned;
};

// TanStack Table case-insensitive alphabetical compare
const caseInsensitiveSort = (rowA, rowB, columnId) => {
  const a = String(rowA.getValue(columnId) ?? '');
  const b = String(rowB.getValue(columnId) ?? '');
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_REQUIREMENTS = [
  { key: 'length', label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { key: 'upper', label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { key: 'number', label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { key: 'special', label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

function getPasswordStrength(password) {
  if (!password) return { label: '', score: 0, color: '' };
  const metCount = PASSWORD_REQUIREMENTS.filter((r) => r.test(password)).length;
  const longBonus = password.length >= 12 ? 1 : 0;
  const score = Math.min(metCount + longBonus, 5);

  if (score <= 1) return { label: 'Weak', score: 1, color: 'bg-red-500' };
  if (score <= 3) return { label: 'Fair', score: 2, color: 'bg-amber-500' };
  if (score <= 4) return { label: 'Good', score: 3, color: 'bg-blue-500' };
  return { label: 'Strong', score: 4, color: 'bg-emerald-500' };
}

// Badge component matching shadcn's visual style
const BADGE_VARIANTS = {
  default: 'bg-blue-600 text-white',
  secondary: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  destructive: 'bg-red-600 text-white',
  warning: 'bg-amber-600 text-white',
  success: 'bg-emerald-600 text-white',
  outline: 'border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300',
};

function Badge({ variant = 'default', children, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${BADGE_VARIANTS[variant]} ${className}`}>
      {children}
    </span>
  );
}

function Spinner({ className = '' }) {
  return <Loader2 className={`w-3.5 h-3.5 animate-spin ${className}`} />;
}

const BARANGAY_DEPARTMENT = 'Paombong Barangay Officials';

const DEPARTMENT_STATION_ADDRESSES = {
  'RHU (Rural Health Unit)': 'Rural Health Unit I, Poblacion, Paombong, Bulacan',
  'MDRRMO (Municipal Disaster Risk Reduction and Management Office)': 'MDRRMO Building, Poblacion, Paombong, Bulacan',
  'BFP (Bureau of Fire Protection)': 'Paombong Fire Station, Poblacion, Paombong, Bulacan',
  'PNP (Philippine National Police)': 'Paombong Municipal Police Station, Poblacion, Paombong, Bulacan',
};

const PAOMBONG_BARANGAYS = [
  'Binakod', 'Kapitangan', 'Malumot', 'Masukol', 'Pinalagdan', 'Poblacion',
  'San Isidro I', 'San Isidro II', 'San Jose', 'San Roque', 'San Vicente',
  'Santa Cruz', 'Santo Niño', 'Santo Rosario'
];

function barangayStationAddress(barangay) {
  return `Barangay Hall, ${barangay}, Paombong, Bulacan`;
}

function SortableHeader({ column, children, align = 'left' }) {
  const sorted = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === 'asc')}
      className={`inline-flex items-center gap-1.5 uppercase tracking-wider text-xs font-semibold hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer ${align === 'right' ? 'justify-end w-full' : ''}`}
    >
      {children}
      {sorted === 'asc' ? <ArrowUp className="w-3 h-3" /> : sorted === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUpDown className="w-3 h-3 opacity-40" />}
    </button>
  );
}

export default function AdminManagement({ darkMode }) {
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState('active');

  const departments = [
    'BFP (Bureau of Fire Protection)',
    'PNP (Philippine National Police)',
    'RHU (Rural Health Unit)',
    'MDRRMO (Municipal Disaster Risk Reduction and Management Office)',
    BARANGAY_DEPARTMENT
  ];

  const [searchTerm, setSearchTerm] = useState('');
  const [sorting, setSorting] = useState([]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // File holding state for delayed upload
  const [selectedAvatarFile, setSelectedAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');

  const [isBarangayModalOpen, setIsBarangayModalOpen] = useState(false);
  const [selectedBarangay, setSelectedBarangay] = useState('');

  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [adminToArchive, setAdminToArchive] = useState(null);
  const [isArchiving, setIsArchiving] = useState(false);

  const [restoringId, setRestoringId] = useState(null);

  const [formData, setFormData] = useState({
    name: '', address: '', email: '', password: '', department: departments[0], avatar: ''
  });
  const [phone, setPhone] = useState('');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'admins'), (snapshot) => {
      const adminList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setAdmins(adminList);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching administrators: ", error);
      toast.error("Failed to sync core registry data.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  };

  const logAuditAction = async (action, type, targetUser) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        action,
        type,
        performedBy: auth.currentUser?.email || 'Unknown',
        targetUser,
        timestamp: serverTimestamp(),
      });
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  };

  const openCreateModal = () => {
    setEditingAdmin(null);
    setFormData({ name: '', address: '', email: '', password: '', department: departments[0], avatar: '' });
    setPhone('');
    setSelectedBarangay('');
    setSelectedAvatarFile(null);
    setAvatarPreview('');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const openEditModal = (admin) => {
    setEditingAdmin(admin);
    setFormData({
      name: admin.name || '',
      address: admin.address || '',
      email: admin.email || '',
      department: admin.department || departments[0],
      avatar: admin.avatar || '',
      password: '••••••••',
    });
    // Format existing phone numbers for proper validation
    setPhone(formatToE164Phone(admin.phone || ''));
    setSelectedBarangay(admin.department === BARANGAY_DEPARTMENT ? (admin.barangay || '') : '');
    setSelectedAvatarFile(null);
    setAvatarPreview(admin.avatar || '');
    setShowPassword(false);
    setIsModalOpen(true);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleDepartmentChange = (e) => {
    const nextDepartment = e.target.value;

    if (nextDepartment === BARANGAY_DEPARTMENT) {
      setFormData(prev => ({ ...prev, department: nextDepartment, address: selectedBarangay ? barangayStationAddress(selectedBarangay) : '' }));
      setIsBarangayModalOpen(true);
      return;
    }

    setFormData(prev => ({
      ...prev,
      department: nextDepartment,
      address: DEPARTMENT_STATION_ADDRESSES[nextDepartment] || prev.address
    }));
  };

  const selectBarangay = (barangay) => {
    setSelectedBarangay(barangay);
    setFormData(prev => ({ ...prev, address: barangayStationAddress(barangay) }));
    setIsBarangayModalOpen(false);
  };

  // Set file locally for preview without uploading immediately
  const handleFileSelection = (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Please select a valid image file.");
      return;
    }

    setSelectedAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelection(file);
  };

  const handleAvatarDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelection(file);
  };

  // Option B: Proxy upload avatar file via server multipart endpoint
  const uploadAvatarToB2 = async (file) => {
    const toastId = toast.loading("Uploading avatar to storage...");

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error("No active user session found. Please log in again.");
      }

      const idToken = await user.getIdToken(true);
      const targetUid = editingAdmin?.uid || editingAdmin?.id || 'new_admin';

      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('uid', targetUid);

      const uploadResponse = await fetch(`${API_BASE_URL}/api/admin/upload-avatar`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${idToken}`
        },
        body: formDataUpload
      });

      const data = await uploadResponse.json();

      if (!uploadResponse.ok || !data.success) {
        throw new Error(data.error || data.message || `Upload failed with status ${uploadResponse.status}`);
      }

      toast.success("Avatar uploaded successfully!", { id: toastId });
      return data.fileUrl;
    } catch (error) {
      console.error("Avatar Upload Error:", error);
      toast.error(error.message || "Failed to upload avatar.", { id: toastId });
      throw error;
    }
  };

  // --- Live validation ---
  const nameValid = formData.name.trim().length > 0;
  const emailValid = EMAIL_REGEX.test(formData.email.trim());
  const phoneValid = !!phone && isValidPhoneNumber(phone);

  const passwordRequirementResults = useMemo(
    () => PASSWORD_REQUIREMENTS.map((req) => ({ ...req, met: req.test(formData.password) })),
    [formData.password]
  );
  const passwordValid = editingAdmin ? true : passwordRequirementResults.every((r) => r.met);
  const strength = getPasswordStrength(formData.password);

  const isFormValid = nameValid && emailValid && phoneValid && passwordValid;

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isFormValid) {
      if (!nameValid) toast.error('Full Name is required.');
      else if (!emailValid) toast.error('Enter a valid email address.');
      else if (!phoneValid) toast.error('Enter a valid phone number.');
      else if (!passwordValid) toast.error('Password does not meet all requirements.');
      return;
    }

    setIsSaving(true);

    try {
      // Step A: Perform file upload via server proxy FIRST if a new file was selected
      let finalAvatarUrl = formData.avatar;
      if (selectedAvatarFile) {
        finalAvatarUrl = await uploadAvatarToB2(selectedAvatarFile);
      }

      // Step B: Save changes / Create account with resolved avatar URL
      const fullPhone = phone;
      const barangay = formData.department === BARANGAY_DEPARTMENT ? (selectedBarangay || null) : null;

      if (editingAdmin) {
        // 1. Update Firestore Database
        const adminRef = doc(db, 'admins', editingAdmin.id);
        const updatedData = {
          name: formData.name || '',
          phone: fullPhone,
          address: formData.address || '',
          email: formData.email || '',
          department: formData.department || departments[0],
          barangay,
          avatar: finalAvatarUrl || ''
        };
        await updateDoc(adminRef, updatedData);

        // 2. Sync changes over to Firebase Auth & Firestore backend update
        if (editingAdmin.uid) {
          const idToken = await auth.currentUser?.getIdToken(true);
          const response = await fetch(`${API_BASE_URL}/api/admin/update-admin-auth`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
              uid: editingAdmin.uid,
              email: formData.email,
              name: formData.name,
              phone: fullPhone,
              department: formData.department,
              barangay,
              address: formData.address,
              avatar: finalAvatarUrl
            }),
          });

          const data = await response.json();
          if (!response.ok) {
            throw new Error(data.error || 'Failed to sync authentication profile credentials.');
          }
        }

        await logAuditAction('Updated admin account', 'update', formData.name);
        toast.success('Account updated successfully!');
      } else {
        // Create account on backend (enforces Document ID === Auth UID)
        const idToken = await auth.currentUser?.getIdToken(true);
        const response = await fetch(`${API_BASE_URL}/api/admin/create-admin`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            name: formData.name,
            department: formData.department,
            barangay,
            phone: fullPhone,
            address: formData.address,
            avatar: finalAvatarUrl
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to provision admin account on server.');
        }

        await logAuditAction('Created admin account', 'create', formData.name);
        toast.success('Account created successfully!');
      }
      setIsModalOpen(false);
    } catch (error) {
      console.error(error);
      toast.error(error.message || 'An error occurred while saving.');
    } finally {
      setIsSaving(false);
    }
  };

  const initiateArchive = (admin) => {
    setAdminToArchive(admin);
    setIsArchiveModalOpen(true);
  };

  const confirmArchive = async () => {
    if (!adminToArchive) return;
    setIsArchiving(true);
    try {
      await updateDoc(doc(db, 'admins', adminToArchive.id), {
        archived: true,
        archivedAt: serverTimestamp(),
        archivedBy: auth.currentUser?.email || 'Unknown',
      });
      await logAuditAction('Archived admin account', 'archive', adminToArchive.name);
      toast.success('Account archived successfully.');
    } catch (error) {
      console.error('Archive Flow Error:', error);
      toast.error(error.message || 'Failed to archive account.');
    } finally {
      setIsArchiving(false);
      setIsArchiveModalOpen(false);
      setAdminToArchive(null);
    }
  };

  const restoreAdmin = async (admin) => {
    setRestoringId(admin.id);
    try {
      await updateDoc(doc(db, 'admins', admin.id), {
        archived: false,
        archivedAt: null,
        archivedBy: null,
      });
      await logAuditAction('Restored admin account', 'restore', admin.name);
      toast.success('Account restored successfully.');
    } catch (error) {
      console.error('Restore Flow Error:', error);
      toast.error(error.message || 'Failed to restore account.');
    } finally {
      setRestoringId(null);
    }
  };

  const viewAdmins = useMemo(
    () => admins.filter(admin => (viewMode === 'archived' ? admin.archived === true : !admin.archived)),
    [admins, viewMode]
  );

  const rowHover = darkMode ? "hover:bg-slate-800/40" : "hover:bg-slate-50/90";
  const textPrimary = darkMode ? "text-white" : "text-slate-900";
  const textSecondary = darkMode ? "text-slate-400" : "text-slate-500";
  const borderSeparator = darkMode ? "border-slate-800" : "border-slate-200/60";
  const inputStyling = darkMode ? "bg-slate-900 border-slate-800 text-white focus:border-blue-500 focus:ring-blue-500/20" : "bg-white border-slate-200 text-slate-900 focus:border-blue-600 focus:ring-blue-600/10";
  const errorText = "text-xs text-red-500 mt-1";

  const columns = useMemo(() => [
    {
      id: 'admin',
      accessorFn: (admin) => admin.name || '',
      sortingFn: caseInsensitiveSort,
      header: ({ column }) => <SortableHeader column={column}>Admin Details</SortableHeader>,
      cell: ({ row }) => {
        const admin = row.original;
        return (
          <div className="flex items-center gap-3.5">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-inner overflow-hidden ${admin.avatarBg || 'bg-slate-500'}`}>
              {admin.avatar ? (
                <img src={admin.avatar} alt="" className="w-full h-full object-cover rounded-full" />
              ) : (
                getInitials(admin.name)
              )}
            </div>
            <div>
              <span className={`font-semibold text-base block ${textPrimary}`}>{admin.name}</span>
              <div className={`text-sm mt-0.5 ${textSecondary}`}>{admin.email}</div>
            </div>
          </div>
        );
      },
    },
    {
      id: 'adminId',
      accessorFn: (admin) => admin.adminId || '',
      sortingFn: caseInsensitiveSort,
      header: ({ column }) => <SortableHeader column={column}>Admin ID</SortableHeader>,
      cell: ({ row }) => {
        const adminId = row.original.adminId;
        if (!adminId) {
          return <span className={`text-xs ${textSecondary}`}>—</span>;
        }
        return (
          <span className={`inline-block text-[11px] font-mono font-semibold px-2 py-1 rounded-md border ${
            darkMode ? 'border-slate-700 text-slate-300 bg-slate-800/60' : 'border-slate-200 text-slate-600 bg-slate-50'
          }`}>
            {adminId}
          </span>
        );
      },
    },
    {
      id: 'department',
      accessorFn: (admin) => admin.department || '',
      sortingFn: caseInsensitiveSort,
      header: ({ column }) => <SortableHeader column={column}>Agency</SortableHeader>,
      cell: ({ row }) => {
        const admin = row.original;
        return (
          <span className={`inline-block px-2.5 py-1 text-xs font-semibold rounded-md border ${
            admin.department?.includes('BFP') ? 'bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400' :
            admin.department?.includes('PNP') ? 'bg-blue-500/10 border-blue-500/20 text-blue-500 dark:text-blue-400' :
            admin.department?.includes('RHU') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 dark:text-emerald-400' :
            'bg-purple-500/10 border-purple-500/20 text-purple-500 dark:text-purple-400'
          }`}>
            {admin.department}
            {admin.department === BARANGAY_DEPARTMENT && admin.barangay && ` — ${admin.barangay}`}
          </span>
        );
      },
    },
    {
      id: 'contact',
      accessorFn: (admin) => admin.phone || '',
      sortingFn: caseInsensitiveSort,
      header: ({ column }) => <SortableHeader column={column}>Contact/Address</SortableHeader>,
      cell: ({ row }) => {
        const admin = row.original;
        return (
          <div className={textSecondary}>
            <div className="font-semibold text-slate-700 dark:text-slate-300">{admin.phone}</div>
            <div className="text-xs opacity-85 mt-0.5">{admin.address}</div>
          </div>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right uppercase tracking-wider text-xs font-semibold">Actions</div>,
      enableSorting: false,
      cell: ({ row }) => {
        const admin = row.original;
        return (
          <div className="inline-flex gap-1 justify-end w-full">
            {viewMode === 'active' ? (
              <>
                <button onClick={() => openEditModal(admin)} className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-blue-500 transition-colors ${textSecondary}`} title="Edit">
                  <Edit2 className="w-4 h-4" />
                </button>
                <button onClick={() => initiateArchive(admin)} className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-amber-500 transition-colors ${textSecondary}`} title="Archive">
                  <Archive className="w-4 h-4" />
                </button>
              </>
            ) : (
              restoringId === admin.id ? (
                <Badge variant="success">
                  <Spinner /> Restoring
                </Badge>
              ) : (
                <button onClick={() => restoreAdmin(admin)} className={`p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-emerald-500 transition-colors ${textSecondary}`} title="Restore">
                  <ArchiveRestore className="w-4 h-4" />
                </button>
              )
            )}
          </div>
        );
      },
    },
  ], [viewMode, restoringId, darkMode]);

  const table = useReactTable({
    data: viewAdmins,
    columns,
    state: {
      sorting,
      globalFilter: searchTerm,
      pagination,
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setSearchTerm,
    onPaginationChange: setPagination,
    globalFilterFn: (row, _columnId, filterValue) => {
      const admin = row.original;
      const term = filterValue.toLowerCase();
      return (
        (admin.name?.toLowerCase() || '').includes(term) ||
        (admin.adminId?.toLowerCase() || '').includes(term) ||
        (admin.department?.toLowerCase() || '').includes(term) ||
        (admin.email?.toLowerCase() || '').includes(term)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const rows = table.getRowModel().rows;

  return (
    <div className={`w-full text-sm transition-all ${darkMode ? "text-slate-100" : "text-slate-800"}`}>
      
      <Toaster 
        position="top-right"
        toastOptions={{
          style: darkMode ? { background: '#0f172a', color: '#fff', border: '1px solid #1e293b' } : { background: '#fff', color: '#0f172a', border: '1px solid #e2e8f0' }
        }}
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative min-w-none sm:min-w-[320px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search by name, email, or department..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPagination(p => ({ ...p, pageIndex: 0 })); }}
              className={`w-full pl-10 pr-4 py-2 text-sm rounded-xl border focus:outline-hidden focus:ring-4 transition-all ${inputStyling}`}
            />
          </div>
          
          <button 
            onClick={openCreateModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Administrator</span>
          </button>
        </div>
      </div>

      {/* Active / Archived toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setViewMode('active'); setPagination(p => ({ ...p, pageIndex: 0 })); }}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            viewMode === 'active'
              ? 'bg-blue-600 text-white'
              : darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Active
        </button>
        <button
          onClick={() => { setViewMode('archived'); setPagination(p => ({ ...p, pageIndex: 0 })); }}
          className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
            viewMode === 'archived'
              ? 'bg-blue-600 text-white'
              : darkMode ? 'text-slate-400 hover:bg-slate-800' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          Archived
        </button>
      </div>

      {/* Data Table */}
      {loading ? (
        <div className="text-center py-24">
          <p className={`text-base ${textSecondary}`}>Synchronizing data with registry core...</p>
        </div>
      ) : (
        <div className={`w-full overflow-hidden rounded-xl border ${borderSeparator}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id} className={`border-b font-semibold ${textSecondary} ${borderSeparator}`}>
                    {headerGroup.headers.map((header, i) => (
                      <th
                        key={header.id}
                        className={`py-3 ${i === 0 ? 'px-4' : 'px-2'} ${header.id === 'actions' ? 'pr-4 text-right' : ''}`}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody className={`divide-y ${borderSeparator}`}>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id} className={`transition-all ${rowHover}`}>
                      {row.getVisibleCells().map((cell, i) => (
                        <td key={cell.id} className={`py-4 align-middle ${i === 0 ? 'px-4' : 'px-2'} ${cell.column.id === 'actions' ? 'pr-4' : ''}`}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className="py-24 text-center">
                      <span className={textSecondary}>
                        {searchTerm
                          ? 'No administrators match your search.'
                          : viewMode === 'archived' ? 'No archived administrator records.' : 'No responsive administrator records found.'}
                      </span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination controls */}
          {rows.length > 0 && (
            <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t ${borderSeparator}`}>
              <div className={`text-xs ${textSecondary}`}>
                Showing {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}
                {'–'}
                {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)}
                {' of '}{table.getFilteredRowModel().rows.length}
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${textSecondary}`}>Rows per page</span>
                  <select
                    value={table.getState().pagination.pageSize}
                    onChange={(e) => table.setPageSize(Number(e.target.value))}
                    className={`text-xs rounded-lg border px-2 py-1 outline-none ${inputStyling}`}
                  >
                    {[10, 20, 50].map((size) => (
                      <option key={size} value={size}>{size}</option>
                    ))}
                  </select>
                </div>

                <div className={`text-xs font-medium ${textSecondary}`}>
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                    className={`p-1.5 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${borderSeparator}`}
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className={`p-1.5 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${borderSeparator}`}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className={`p-1.5 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${borderSeparator}`}
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                    className={`p-1.5 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer ${borderSeparator}`}
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Creation / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className={`w-full max-w-md max-h-[85vh] rounded-2xl border shadow-xl flex flex-col overflow-hidden transition-all ${darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'}`}>
            <div className={`flex justify-between items-center px-6 py-4 border-b shrink-0 ${borderSeparator}`}>
              <div>
                <h2 className="text-lg font-semibold">{editingAdmin ? 'Update Admin Profile' : 'Create Admin Account'}</h2>
                {editingAdmin?.adminId && (
                  <span className={`text-xs font-mono ${textSecondary}`}>{editingAdmin.adminId}</span>
                )}
                {!editingAdmin && (
                  <p className={`text-xs mt-0.5 ${textSecondary}`}>A unique admin ID is assigned automatically on save.</p>
                )}
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                
                {/* Backblaze B2 Express Proxy Avatar Upload Box */}
                <div 
                  className="relative w-20 h-20 rounded-full flex items-center justify-center border-2 border-dashed cursor-pointer overflow-hidden mx-auto hover:border-blue-500 transition-colors"
                  onClick={() => document.getElementById('avatarUpload').click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleAvatarDrop(e)}
                >
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-slate-400" />
                  )}
                </div>
                <input type="file" id="avatarUpload" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
                <p className="text-xs text-center text-slate-500">
                  {selectedAvatarFile ? `Selected: ${selectedAvatarFile.name}` : "Drag & drop or click to pick profile image"}
                </p>

                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500">Full Name <span className="text-red-500">*</span></label>
                    <input
                      type="text" name="name" required value={formData.name} onChange={handleInputChange}
                      placeholder="Juan Dela Cruz"
                      className={`w-full mt-1 px-4 py-2 rounded-lg border focus:ring-4 outline-none ${inputStyling} ${!nameValid ? 'border-red-400' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Department</label>
                    <select
                      name="department" value={formData.department} onChange={handleDepartmentChange}
                      className={`w-full mt-1 px-4 py-2 rounded-lg border focus:ring-4 outline-none ${inputStyling}`}
                    >
                      {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">Phone <span className="text-red-500">*</span></label>
                    <div className="mt-1">
                      <PhoneInput
                        value={phone}
                        onChange={(val) => setPhone(val || '')}
                        defaultCountry="PH"
                        international
                      />
                    </div>
                    {phone && !phoneValid && <p className={errorText}>Enter a valid phone number (e.g. +63 912 345 6789).</p>}
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500">Email <span className="text-red-500">*</span></label>
                    <input
                      type="email" name="email" required value={formData.email} onChange={handleInputChange}
                      placeholder="username@alertu.gov"
                      className={`w-full mt-1 px-4 py-2 rounded-lg border focus:ring-4 outline-none ${inputStyling} ${formData.email && !emailValid ? 'border-red-400' : ''}`}
                    />
                    {formData.email && !emailValid && <p className={errorText}>Enter a valid email address.</p>}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-slate-500">Station Address</label>
                      {formData.department === BARANGAY_DEPARTMENT && (
                        <button
                          type="button"
                          onClick={() => setIsBarangayModalOpen(true)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-500 hover:text-blue-600 cursor-pointer"
                        >
                          <MapPin className="w-3.5 h-3.5" />
                          {selectedBarangay ? 'Change Barangay' : 'Choose Barangay'}
                        </button>
                      )}
                    </div>
                    <input
                      type="text" name="address" value={formData.address} onChange={handleInputChange}
                      placeholder="San Jose, Paombong, Bulacan"
                      className={`w-full mt-1 px-4 py-2 rounded-lg border focus:ring-4 outline-none ${inputStyling}`}
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-slate-500">
                      Password {!editingAdmin && <span className="text-red-500">*</span>}
                    </label>
                    <div className="relative mt-1">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        required={!editingAdmin}
                        disabled={!!editingAdmin}
                        value={formData.password}
                        onChange={handleInputChange}
                        placeholder={editingAdmin ? "••••••••" : "Assign password"}
                        className={`w-full px-4 py-2 pr-10 rounded-lg border focus:ring-4 outline-none ${inputStyling} disabled:opacity-50`}
                      />
                      {!editingAdmin && (
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      )}
                    </div>

                    {!editingAdmin && formData.password && (
                      <div className="mt-2">
                        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                          <div className={`h-full ${strength.color} transition-all`} style={{ width: `${(strength.score / 4) * 100}%` }} />
                        </div>
                        <span className="text-[11px] font-medium mt-1 block">{strength.label}</span>
                      </div>
                    )}

                    {!editingAdmin && (
                      <ul className="mt-2 space-y-1">
                        {passwordRequirementResults.map((req) => (
                          <li key={req.key} className={`flex items-center gap-1.5 text-xs ${req.met ? 'text-emerald-500' : 'text-slate-400'}`}>
                            {req.met ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                            {req.label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              <div className={`flex justify-end gap-3 px-6 py-4 border-t shrink-0 ${borderSeparator}`}>
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
                {isSaving ? (
                  <Badge variant="secondary" className="px-5 py-2">
                    <Spinner /> {editingAdmin ? 'Saving Changes' : 'Creating Account'}
                  </Badge>
                ) : (
                  <button
                    type="submit"
                    disabled={!isFormValid}
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {editingAdmin ? 'Save Changes' : 'Create Account'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barangay Picker Modal */}
      {isBarangayModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-xl relative scale-in-center transition-all ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="p-2.5 bg-purple-500/10 text-purple-500 rounded-xl shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold">Select Barangay</h3>
                  <p className={`text-xs mt-0.5 ${textSecondary}`}>Sets this admin's station to the chosen barangay's hall.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBarangayModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
              {PAOMBONG_BARANGAYS.map((barangay) => (
                <button
                  key={barangay}
                  type="button"
                  onClick={() => selectBarangay(barangay)}
                  className={`text-left px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                    selectedBarangay === barangay
                      ? 'bg-purple-600 border-purple-600 text-white'
                      : darkMode ? 'border-slate-800 hover:bg-slate-800 text-slate-200' : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  {barangay}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fade-in">
          <div className={`w-full max-w-md rounded-2xl border p-6 shadow-xl relative scale-in-center transition-all ${
            darkMode ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-800'
          }`}>
            <div className="flex items-start gap-4">
              <div className="p-3 bg-amber-500/10 text-amber-500 rounded-xl shrink-0">
                <Archive className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 w-full">
                <h3 className="text-lg font-bold">Archive Administrator Account?</h3>
                <p className={`text-sm ${textSecondary}`}>
                  <strong className={textPrimary}>{adminToArchive?.name}</strong> will be moved to the Archived list and removed from active admin counts. This can be undone anytime by restoring the account.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-slate-100 dark:border-slate-800">
              <button 
                type="button" 
                disabled={isArchiving}
                onClick={() => { setIsArchiveModalOpen(false); setAdminToArchive(null); }}
                className="px-4 py-2 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 font-medium disabled:opacity-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {isArchiving ? (
                <Badge variant="warning" className="px-4 py-2">
                  <Spinner /> Archiving
                </Badge>
              ) : (
                <button 
                  type="button"
                  onClick={confirmArchive}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold shadow transition-colors cursor-pointer"
                >
                  Archive Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}