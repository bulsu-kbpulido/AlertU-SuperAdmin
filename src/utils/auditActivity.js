/**
 * Telemetry and low-level UI navigation actions that should not clutter the main audit stream
 */
export const TELEMETRY_ACTIONS = new Set([
  'CLOSE_VERIFY_MODAL',
  'OPEN_VERIFY_MODAL',
  'FIRST_STEPMODAL',
  'SECOND_STEPMODAL',
  'THIRD_STEPMODAL',
  'VERIFY_STEP_CHANGED',
  'VERIFY_FIELD_UPDATED',
  'CANCEL_VERIFICATION',
  'VIEW_REPORT',
]);

/**
 * Checks if a log entry represents a meaningful administrative activity made by a Department Admin.
 * Super Admin internal actions (and telemetry) are filtered out so this feed stays purely focused on
 * Department Admin operations (PNP, BFP, RHU, MDRRMO, Barangay).
 */
export const isMeaningfulAdminActivity = (log) => {
  if (!log) return false;
  const action = String(log.action || '').toUpperCase().trim();
  const actorRole = String(log.actorRole || log.role || '').toLowerCase().trim();
  const adminId = String(log.adminId || '').toUpperCase().trim();
  const adminName = String(log.adminName || '').toLowerCase().trim();

  // Exclude UI telemetry
  if (TELEMETRY_ACTIONS.has(action)) {
    return false;
  }

  // Exclude Super Admin internal activities (stored separately in superadmin_audit_logs)
  if (
    actorRole === 'superadmin' ||
    adminId === 'SUPERADMIN' ||
    adminName.includes('super admin') ||
    adminName.includes('superadmin') ||
    action.includes('SUPERADMIN')
  ) {
    return false;
  }

  return true;
};

/**
 * Categorizes an audit log entry for filtering
 */
export const getActionCategory = (log) => {
  const action = String(log?.action || '').toUpperCase().trim();

  if (TELEMETRY_ACTIONS.has(action)) {
    return 'TELEMETRY';
  }

  if (
    action.includes('REPORT') ||
    action.includes('DISPATCH') ||
    action.includes('INCIDENT') ||
    action.includes('RESOLVE') ||
    action.includes('REJECT')
  ) {
    return 'INCIDENTS';
  }

  if (action.includes('CITIZEN')) {
    return 'CITIZENS';
  }

  if (
    action.includes('ADMIN') ||
    action.includes('PROFILE') ||
    action.includes('PASSWORD')
  ) {
    if (action.includes('LOGIN')) return 'AUTH';
    return 'ADMIN_MANAGEMENT';
  }

  if (action.includes('LOGIN') || action.includes('AUTH') || action.includes('SESSION')) {
    return 'AUTH';
  }

  if (action.includes('EXPORT') || action.includes('SHARE') || action.includes('LINK')) {
    return 'EXPORTS_AND_SHARING';
  }

  return 'OTHER';
};

/**
 * Converts internal action constant into a clear, human-readable display string
 */
export const formatActionDisplay = (actionStr) => {
  if (!actionStr) return 'Department Admin Action';
  const action = String(actionStr).toUpperCase().trim();

  const ACTION_MAP = {
    REPORT_VERIFIED: 'Verified Incident Report',
    VERIFIED_REPORT_DISPATCH: 'Verified & Dispatched Incident',
    DISPATCH_FINALIZED: 'Finalized Incident Dispatch',
    RESOLVE_REPORT: 'Resolved Incident Report',
    ARCHIVE_REPORT: 'Archived Incident Report',
    REJECT_REPORT: 'Rejected Incident Report',

    CREATE_CITIZEN: 'Registered Citizen Account',
    EDIT_CITIZEN: 'Updated Citizen Profile',
    DISABLE_CITIZEN_ACCOUNT: 'Disabled Citizen Account',
    ENABLE_CITIZEN_ACCOUNT: 'Reactivated Citizen Account',
    VIEW_CITIZEN_PROFILE: 'Viewed Citizen Profile',

    CREATE_ADMIN: 'Created Admin Account',
    EDIT_ADMIN: 'Updated Admin Account',
    ARCHIVE_ADMIN: 'Archived Admin Account',
    RESTORE_ADMIN: 'Restored Admin Account',

    LOGIN_SUCCESS: 'Administrator Logged In',
    LOGIN_FAILED: 'Failed Admin Login Attempt',

    GENERATE_SHARE_LINK: 'Generated Incident Share Link',
    REVOKE_SHARE_LINK: 'Revoked Incident Share Link',
    COPY_SHARE_LINK: 'Copied Incident Share Link',

    EXPORT_DATA: 'Exported Analytics Data',
    EXPORT_FILTERED_REPORTS: 'Exported Reports (CSV)',
    EXPORT_BARANGAY_ANALYTICS: 'Exported Barangay Analytics',
    EXPORT_CITIZEN_AGENCY_STATS: 'Exported Citizen & Agency Stats',
  };

  if (ACTION_MAP[action]) {
    return ACTION_MAP[action];
  }

  // Generic fallback: snake/screaming_snake to title case
  return action
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};
