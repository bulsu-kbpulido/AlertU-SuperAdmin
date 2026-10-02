import { useEffect } from 'react';
import { useAuditLog } from '../useAuditLog';

/**
 * Call ONCE near the top of the app (e.g. in App.jsx) to record uncaught errors
 * and unhandled promise rejections under Audit Logs -> System Errors.
 */
export function useGlobalErrorLogging() {
  const { logSystemError } = useAuditLog();

  useEffect(() => {
    const onError = (event) => {
      logSystemError(event.error || new Error(event.message || 'Unknown error'), {
        source: 'window.onerror',
        operation: event.filename ? `${event.filename}:${event.lineno}` : undefined,
      });
    };
    const onRejection = (event) => {
      const reason = event.reason;
      logSystemError(reason instanceof Error ? reason : new Error(String(reason)), {
        source: 'unhandledrejection',
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, [logSystemError]);
}

export default useGlobalErrorLogging;
