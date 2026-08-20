import { useState, useEffect, useMemo } from 'react';
import { Terminal, Search, Copy, Check, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

export default function AuditLogs({ darkMode }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    // Fetch top 100 recent audit log entries
    const logsQuery = query(collection(db, 'audit_logs'), orderBy('createdAt', 'desc'), limit(100));
    const unsubscribe = onSnapshot(
      logsQuery,
      (snapshot) => {
        setLogs(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching audit logs:', error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
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

  // Filter logs based on search input
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const logString = getConsoleLogString(log).toLowerCase();
      const search = searchTerm.toLowerCase();
      return logString.includes(search) || (log.eventId || '').toLowerCase().includes(search);
    });
  }, [logs, searchTerm]);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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
    if (ts?.toDate) {
      return ts.toDate().toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
    if (isoTimestamp) {
      return new Date(isoTimestamp).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
    return '—';
  };

  return (
    <div className="w-full text-slate-800 font-sans" style={{ fontFamily: 'Roboto, sans-serif' }}>
      {/* 🔹 Header Section */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 mb-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                <FileText className="w-5 h-5" />
              </div>
              System Activity Logs
            </h1>
            <p className="text-sm text-slate-500">
              A clean list of all admin actions and backend system movements.
            </p>
          </div>

          {/* Search Field */}
          <div className="relative min-w-[280px] md:min-w-[340px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by admin name, action, or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-3 focus:ring-blue-500/10 focus:outline-none transition-all placeholder:text-slate-400"
            />
          </div>
        </div>
      </div>

      {/* 🔹 Main Log Table / List Container */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="text-center py-20">
            <p className="text-sm text-slate-500 font-medium">Loading system activity logs...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-20 px-4">
            <Terminal className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700">No matching logs found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting your search terms.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {paginatedLogs.map((log) => {
              const consoleMessage = getConsoleLogString(log);
              const isCopied = copiedId === log.id;

              return (
                <div
                  key={log.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:bg-slate-50/80 transition-colors"
                >
                  {/* Log Content */}
                  <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                    <span className="shrink-0 text-[11px] font-medium tracking-wide px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 border border-slate-200/60 select-none">
                      {formatTimestamp(log.createdAt, log.timestamp)}
                    </span>
                    <p className="text-xs md:text-sm font-mono text-slate-800 break-all leading-relaxed">
                      {consoleMessage}
                    </p>
                  </div>

                  {/* Quick Copy Action */}
                  <div className="flex items-center justify-end shrink-0 pt-1 sm:pt-0">
                    <button
                      onClick={() => handleCopy(consoleMessage, log.id)}
                      title="Copy log string"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-blue-600 hover:bg-blue-50/80 border border-transparent hover:border-blue-100 transition-all"
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-600">Copied</span>
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
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 bg-slate-50/50 border-t border-slate-100 text-xs text-slate-600">
            <div>
              Showing <span className="font-semibold text-slate-800">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
              <span className="font-semibold text-slate-800">
                {Math.min(currentPage * itemsPerPage, filteredLogs.length)}
              </span>{' '}
              of <span className="font-semibold text-slate-800">{filteredLogs.length}</span> entries
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>

              <span className="px-3 py-1 font-semibold text-slate-700">
                {currentPage} / {totalPages}
              </span>

              <button
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
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