import { useState, useEffect, useMemo } from 'react';
import { Terminal, Search, Copy, Check, ChevronLeft, ChevronRight, FileText, Filter, Shield, AlertTriangle, Users, Share2 } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, limit, onSnapshot } from 'firebase/firestore';
import { onAuditLogReceived } from '../socket';
import { 
  isMeaningfulAdminActivity, 
  getActionCategory, 
  formatActionDisplay 
} from '../utils/auditActivity';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const parseDate = (val) => {
  if (!val) return null;
  if (val.toDate && typeof val.toDate === 'function') return val.toDate();
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

const CATEGORIES = [
  { id: 'meaningful', label: 'Admin Activities', icon: FileText },
  { id: 'INCIDENTS', label: 'Incidents & Dispatches', icon: AlertTriangle },
  { id: 'CITIZENS', label: 'Citizen Management', icon: Users },
  { id: 'ADMIN_MANAGEMENT', label: 'Admin Accounts', icon: Shield },
  { id: 'EXPORTS_AND_SHARING', label: 'Exports & Sharing', icon: Share2 },
  { id: 'AUTH', label: 'Sign-In & Auth', icon: Shield },
];

export default function AuditLogs({ darkMode }) {
  useDocumentTitle('Audit Logs – AlertU');

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('meaningful');
  const [copiedId, setCopiedId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 1. Real-time Firestore sync for Audit Logs
  useEffect(() => {
    const logsQuery = query(collection(db, 'audit_logs'), limit(300));
    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => {
        const rawDocs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        rawDocs.sort((a, b) => {
          const aTime = parseDate(a.createdAt)?.getTime() || parseDate(a.timestamp)?.getTime() || 0;
          const bTime = parseDate(b.createdAt)?.getTime() || parseDate(b.timestamp)?.getTime() || 0;
          return bTime - aTime;
        });
        setLogs(rawDocs);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching audit logs from Firestore:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // 2. Real-time WebSocket listener for instant pushed logs
  useEffect(() => {
    const unsubscribeSocket = onAuditLogReceived((newLog) => {
      if (!newLog) return;
      setLogs((prev) => {
        const exists = prev.some(
          (l) => l.id === newLog.eventId || l.eventId === newLog.eventId
        );
        if (exists) return prev;
        return [newLog, ...prev];
      });
    });
    return () => unsubscribeSocket();
  }, []);

  /**
   * Reads or formats the exact backend terminal console log string
   */
  const getConsoleLogString = (log) => {
    if (log.consoleLogMessage) {
      return log.consoleLogMessage;
    }
    const adminId = log.adminId || 'ADMIN';
    const adminName = log.adminName || log.performedBy || 'System Admin';
    const action = log.action || 'SYSTEM_ACTION';
    const target = log.target || log.targetUser || 'N/A';

    return `⚡ [Admin Movement Captured] [ID: ${adminId}] ${adminName} → ${action} (${target})`;
  };

  // Filter logs based on category and search query
  const filteredLogs = useMemo(() => {
    let result = logs;

    // 1. Category Filtering
    if (selectedCategory === 'meaningful') {
      result = result.filter(isMeaningfulAdminActivity);
    } else {
      result = result.filter((log) => getActionCategory(log) === selectedCategory);
    }

    // 2. Search Query Filtering
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      result = result.filter((log) => {
        const rawString = getConsoleLogString(log).toLowerCase();
        const actionDisplay = formatActionDisplay(log.action).toLowerCase();
        const eventId = String(log.eventId || log.id || '').toLowerCase();
        const adminName = String(log.adminName || log.performedBy || '').toLowerCase();
        const adminId = String(log.adminId || '').toLowerCase();
        const action = String(log.action || '').toLowerCase();
        const target = String(log.target || log.targetUser || '').toLowerCase();
        const department = String(log.department || '').toLowerCase();

        return (
          rawString.includes(search) ||
          actionDisplay.includes(search) ||
          eventId.includes(search) ||
          adminName.includes(search) ||
          adminId.includes(search) ||
          action.includes(search) ||
          target.includes(search) ||
          department.includes(search)
        );
      });
    }

    return result;
  }, [logs, selectedCategory, searchTerm]);

  // Reset to first page when search query or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategory]);

  // Pagination calculation
  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage) || 1;
  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage, itemsPerPage]);

  const handleCopy = (logString, id) => {
    navigator.clipboard.writeText(logString);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatTimestamp = (ts, isoTimestamp) => {
    const d = parseDate(ts) || parseDate(isoTimestamp);
    if (!d) return '—';
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const cardBg = darkMode ? "bg-slate-900 border-slate-800 text-slate-100" : "bg-white border-slate-200/80 text-slate-800";
  const inputBg = darkMode ? "bg-slate-950 border-slate-800 text-white placeholder:text-slate-500 focus:bg-slate-900 focus:border-blue-500" : "bg-slate-50/50 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-500";
  const rowHover = darkMode ? "hover:bg-slate-800/60" : "hover:bg-slate-50/80";
  const borderSeparator = darkMode ? "border-slate-800" : "border-slate-100";
  const textSubtle = darkMode ? "text-slate-400" : "text-slate-500";

  return (
    <div className={`w-full font-sans transition-colors duration-200 ${darkMode ? 'text-slate-100' : 'text-slate-800'}`} style={{ fontFamily: 'Roboto, sans-serif' }}>
      
      {/* 🔹 Header Section */}
      <div className={`border rounded-2xl p-6 mb-6 shadow-xs ${cardBg}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className={`text-xl font-bold flex items-center gap-2.5 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <div className={`p-2 rounded-xl border ${darkMode ? 'bg-blue-950/60 text-blue-400 border-blue-800/50' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                <FileText className="w-5 h-5" />
              </div>
              Administrator Activity & Audit Logs
            </h1>
            <p className={`text-sm ${textSubtle}`}>
              Captures and audits all operational actions performed by administrators in AlertU.
            </p>
          </div>

          {/* Search Field */}
          <div className="relative min-w-[280px] lg:min-w-[340px]">
            <Search className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
            <input
              type="text"
              placeholder="Search by action, admin name, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border focus:ring-3 focus:ring-blue-500/10 focus:outline-none transition-all ${inputBg}`}
            />
          </div>
        </div>

        {/* 🔹 Filter Categories Bar with Horizontal Scrollbar */}
        <div 
          className={`flex items-center gap-2 mt-5 pt-4 border-t overflow-x-auto pb-2.5 scroll-smooth custom-scrollbar ${borderSeparator}`}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: darkMode ? '#475569 #0f172a' : '#cbd5e1 #f8fafc',
          }}
        >
          <span className={`text-xs font-semibold shrink-0 mr-1 flex items-center gap-1 ${textSubtle}`}>
            <Filter className="w-3.5 h-3.5" /> Filter:
          </span>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : darkMode
                    ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{cat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 🔹 Main Log Table / List Container */}
      <div className={`border rounded-2xl shadow-xs overflow-hidden ${cardBg}`}>
        {loading ? (
          <div className="text-center py-20">
            <p className={`text-sm font-medium ${textSubtle}`}>Loading activity logs from Firebase...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-20 px-4">
            <Terminal className={`w-8 h-8 mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <p className={`text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>No matching activity logs found</p>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>Try selecting another category or clearing your search query.</p>
          </div>
        ) : (
          <div className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
            {paginatedLogs.map((log) => {
              const consoleMessage = getConsoleLogString(log);
              const actionTitle = formatActionDisplay(log.action);
              const actorName = log.adminName || log.performedBy || 'System Admin';
              const targetDesc = log.target || log.targetUser || 'System';
              const logId = log.id || log.eventId;
              const isCopied = copiedId === logId;

              return (
                <div
                  key={logId}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition-colors ${rowHover}`}
                >
                  {/* Log Content */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <span className={`shrink-0 text-[11px] font-mono font-semibold tracking-wide px-2.5 py-1 rounded-lg border select-none ${
                      darkMode ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200/60'
                    }`}>
                      {formatTimestamp(log.createdAt, log.timestamp)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {actionTitle}
                        </span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                          darkMode ? 'bg-blue-950/60 text-blue-400 border-blue-800/60' : 'bg-blue-50 text-blue-700 border-blue-100'
                        }`}>
                          {log.department || log.adminId || 'AlertU Admin'}
                        </span>
                      </div>
                      <p className={`text-xs font-mono break-all leading-relaxed ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>{actorName}</span>
                        {` → ${targetDesc}`}
                        {log.details && log.details !== consoleMessage ? ` • ${log.details}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Quick Copy Action */}
                  <div className="flex items-center justify-end shrink-0 pt-1 sm:pt-0">
                    <button
                      onClick={() => handleCopy(consoleMessage, logId)}
                      title="Copy raw audit trace"
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        darkMode 
                          ? 'text-slate-400 hover:text-blue-400 hover:bg-slate-800 border-transparent hover:border-slate-700' 
                          : 'text-slate-600 hover:text-blue-600 hover:bg-blue-50/80 border-transparent hover:border-blue-100'
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-500 font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 🔹 Footer & Pagination Controls */}
        {!loading && filteredLogs.length > 0 && (
          <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t text-xs ${
            darkMode ? 'bg-slate-950/40 border-slate-800 text-slate-400' : 'bg-slate-50/50 border-slate-100 text-slate-600'
          }`}>
            <div>
              Showing <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                {Math.min(currentPage * itemsPerPage, filteredLogs.length)}
              </span>{' '}
              of <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{filteredLogs.length}</span> activities
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium cursor-pointer ${
                  darkMode
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:border-slate-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              <span className={`px-3 py-1 font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium cursor-pointer ${
                  darkMode
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:border-slate-600'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}