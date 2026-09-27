import { useCallback } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase';

/**
 * Helper to safely extract string ID from targets
 */
const resolveTargetString = (targetInput) => {
  if (!targetInput) return 'SYSTEM';

  if (typeof targetInput === 'object') {
    const candidateId =
      targetInput.adminId ||
      targetInput.id ||
      targetInput.uid ||
      targetInput.target ||
      targetInput.targetId ||
      targetInput.email;

    if (candidateId) return String(candidateId);
  } else if (typeof targetInput !== 'object') {
    return String(targetInput);
  }

  return 'SYSTEM';
};

/**
 * Custom hook to record Super Admin actions into a dedicated `superadmin_audit_logs` Firestore collection.
 * This separates Super Admin activities from regular Department Admin audit logs (`audit_logs`).
 */
export const useAuditLog = ({
  adminId = 'SUPERADMIN',
  adminName = 'Super Administrator',
} = {}) => {
  /**
   * Core function to persist Super Admin actions to `superadmin_audit_logs`
   */
  const logMovement = useCallback(
    async (actionTypeOrObj, customTarget = null, extraMetadata = {}) => {
      let actionType = 'SYSTEM_ACTION';
      let targetInput = customTarget;
      let payloadMetadata = extraMetadata;
      let overrideAdminId = adminId;
      let overrideAdminName = adminName;
      let customDetails = null;

      // Current authenticated user info as fallback
      const currentUser = auth.currentUser;
      if (currentUser) {
        if (overrideAdminName === 'Super Administrator' && currentUser.displayName) {
          overrideAdminName = currentUser.displayName;
        } else if (overrideAdminName === 'Super Administrator' && currentUser.email) {
          overrideAdminName = currentUser.email;
        }
        if (overrideAdminId === 'SUPERADMIN' && currentUser.uid) {
          overrideAdminId = currentUser.uid;
        }
      }

      // Handle single object parameter overload
      if (typeof actionTypeOrObj === 'object' && actionTypeOrObj !== null) {
        actionType = actionTypeOrObj.action || actionTypeOrObj.actionType || 'SYSTEM_ACTION';
        targetInput = actionTypeOrObj.target || actionTypeOrObj.targetId || customTarget;
        payloadMetadata = { ...actionTypeOrObj.metadata, ...extraMetadata };
        overrideAdminId = actionTypeOrObj.actorId || actionTypeOrObj.adminId || overrideAdminId;
        overrideAdminName = actionTypeOrObj.adminName || overrideAdminName;
        customDetails = actionTypeOrObj.details || null;
      } else if (typeof actionTypeOrObj === 'string') {
        actionType = actionTypeOrObj;
      }

      const targetString = resolveTargetString(targetInput);
      const eventId = `super_evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const payload = {
        eventId,
        action: actionType,
        target: targetString,
        actorRole: 'superadmin',
        adminId: overrideAdminId,
        adminName: overrideAdminName,
        details:
          customDetails ||
          `${overrideAdminName} (${overrideAdminId}) performed ${actionType} on ${targetString}`,
        metadata: {
          performedAt: new Date().toISOString(),
          ...payloadMetadata,
        },
        createdAt: serverTimestamp(),
        timestamp: new Date().toISOString(),
      };

      try {
        // Persist strictly to `superadmin_audit_logs` collection
        await setDoc(doc(db, 'superadmin_audit_logs', eventId), payload);

        console.log(
          `👑 [SuperAdmin Audit Log Saved] ${overrideAdminName} -> ${actionType} on ${targetString}`,
          payload
        );
        return payload;
      } catch (error) {
        console.error(
          `❌ [SuperAdmin Audit Log Failed] Failed to record action "${actionType}":`,
          error.message
        );
        return null;
      }
    },
    [adminId, adminName]
  );

  const logAction = logMovement;
  const logAdminAction = logMovement;

  // ====================================================
  // 👥 ADMINISTRATOR MANAGEMENT AUDIT HELPERS
  // ====================================================

  const logRegisterAdmin = useCallback(
    (newAdmin) => {
      const targetId = newAdmin?.adminId || newAdmin?.email || newAdmin?.name || 'ADMIN';
      return logMovement({
        action: 'CREATE_ADMIN',
        target: targetId,
        details: `Created administrator account for ${newAdmin?.name || newAdmin?.email} (${newAdmin?.department || 'Unassigned'})`,
        metadata: {
          adminName: newAdmin?.name || 'N/A',
          adminEmail: newAdmin?.email || 'N/A',
          department: newAdmin?.department || 'N/A',
          barangay: newAdmin?.barangay || null,
          phone: newAdmin?.phone || 'N/A',
          address: newAdmin?.address || 'N/A',
          registeredAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logEditAdmin = useCallback(
    (admin, updatedFields = {}) => {
      const targetId = admin?.adminId || admin?.email || admin?.id || 'ADMIN';
      return logMovement({
        action: 'EDIT_ADMIN',
        target: targetId,
        details: `Updated administrator account for ${admin?.name || admin?.email}`,
        metadata: {
          adminName: admin?.name || 'N/A',
          adminEmail: admin?.email || 'N/A',
          updatedFields,
          editedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logArchiveAdmin = useCallback(
    (admin, reason = '') => {
      const targetId = admin?.adminId || admin?.email || admin?.id || 'ADMIN';
      return logMovement({
        action: 'ARCHIVE_ADMIN',
        target: targetId,
        details: `Archived administrator account for ${admin?.name || admin?.email}`,
        metadata: {
          adminName: admin?.name || 'N/A',
          adminEmail: admin?.email || 'N/A',
          department: admin?.department || 'N/A',
          reason,
          archivedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logRestoreAdmin = useCallback(
    (admin) => {
      const targetId = admin?.adminId || admin?.email || admin?.id || 'ADMIN';
      return logMovement({
        action: 'RESTORE_ADMIN',
        target: targetId,
        details: `Restored administrator account for ${admin?.name || admin?.email}`,
        metadata: {
          adminName: admin?.name || 'N/A',
          adminEmail: admin?.email || 'N/A',
          department: admin?.department || 'N/A',
          restoredAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  // ====================================================
  // 👤 CITIZEN MANAGEMENT AUDIT HELPERS
  // ====================================================

  const logViewCitizen = useCallback(
    (citizen) => {
      const targetId = citizen?.citizenId || citizen?.id || citizen?.email || 'CITIZEN';
      return logMovement({
        action: 'VIEW_CITIZEN',
        target: targetId,
        details: `Viewed citizen record for ${citizen?.name || citizen?.email}`,
        metadata: {
          citizenName: citizen?.name || 'N/A',
          citizenEmail: citizen?.email || 'N/A',
          viewedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logRegisterCitizen = useCallback(
    (newCitizen) => {
      const targetId = newCitizen?.citizenId || newCitizen?.email || newCitizen?.name || 'CITIZEN';
      return logMovement({
        action: 'CREATE_CITIZEN',
        target: targetId,
        details: `Registered citizen account for ${newCitizen?.name || newCitizen?.email}`,
        metadata: {
          citizenName: newCitizen?.name || 'N/A',
          citizenEmail: newCitizen?.email || 'N/A',
          address: newCitizen?.address || 'N/A',
          phone: newCitizen?.phone || 'N/A',
          registeredAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logEditCitizen = useCallback(
    (citizen, updatedFields = {}) => {
      const targetId = citizen?.citizenId || citizen?.email || citizen?.id || 'CITIZEN';
      return logMovement({
        action: 'EDIT_CITIZEN',
        target: targetId,
        details: `Updated citizen record for ${citizen?.name || citizen?.email}`,
        metadata: {
          citizenName: citizen?.name || 'N/A',
          citizenEmail: citizen?.email || 'N/A',
          updatedFields,
          editedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logToggleCitizenStatus = useCallback(
    (citizen, newStatus) => {
      const targetId = citizen?.citizenId || citizen?.email || citizen?.id || 'CITIZEN';
      return logMovement({
        action: 'TOGGLE_CITIZEN_STATUS',
        target: targetId,
        details: `${newStatus ? 'Enabled' : 'Disabled'} citizen account for ${citizen?.name || citizen?.email}`,
        metadata: {
          citizenName: citizen?.name || 'N/A',
          citizenEmail: citizen?.email || 'N/A',
          newStatus: newStatus ? 'enabled' : 'disabled',
          changedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logArchiveCitizen = useCallback(
    (citizen, reason = '') => {
      const targetId = citizen?.citizenId || citizen?.email || citizen?.id || 'CITIZEN';
      return logMovement({
        action: 'ARCHIVE_CITIZEN',
        target: targetId,
        details: `Archived citizen record for ${citizen?.name || citizen?.email}`,
        metadata: {
          citizenName: citizen?.name || 'N/A',
          citizenEmail: citizen?.email || 'N/A',
          reason,
          archivedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  // ====================================================
  // 👑 SUPERADMIN PROFILE & SECURITY HELPERS
  // ====================================================

  const logSuperAdminProfileUpdate = useCallback(
    (profileData) => {
      return logMovement({
        action: 'UPDATE_SUPERADMIN_PROFILE',
        target: profileData?.email || 'SUPERADMIN_PROFILE',
        details: `Updated Super Admin profile details for ${profileData?.name || profileData?.email}`,
        metadata: {
          name: profileData?.name || '',
          username: profileData?.username || '',
          email: profileData?.email || '',
          phone: profileData?.phone || '',
          updatedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logSuperAdminPasswordChange = useCallback(
    (email = '') => {
      return logMovement({
        action: 'CHANGE_SUPERADMIN_PASSWORD',
        target: email || 'SUPERADMIN_SECURITY',
        details: `Super Admin changed password for account ${email || ''}`,
        metadata: {
          email,
          changedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  // ====================================================
  // 🔐 AUTHENTICATION AUDIT HELPERS
  // ====================================================

  const logLoginSuccess = useCallback(
    (adminData) => {
      const userUid = adminData?.uid || adminData?.id || auth.currentUser?.uid || 'SUPERADMIN';
      const userEmail = adminData?.email || auth.currentUser?.email || 'superadmin@alertu.com';
      return logMovement({
        action: 'SUPERADMIN_LOGIN_SUCCESS',
        target: userUid,
        actorId: userUid,
        adminName: adminData?.name || adminData?.fullName || userEmail,
        details: `Super Admin ${userEmail} logged into Super Admin Portal.`,
        metadata: {
          email: userEmail,
          role: 'SuperAdmin',
          rememberMe: adminData?.rememberMe || false,
          loggedInAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logLoginFailed = useCallback(
    (email, reason = 'INVALID_CREDENTIALS', errorCode = '') => {
      return logMovement({
        action: 'SUPERADMIN_LOGIN_FAILED',
        target: email || 'UNKNOWN_USER',
        actorId: 'UNAUTHENTICATED_USER',
        adminName: email || 'Guest User',
        details: `Failed login attempt for Super Admin email: ${email}`,
        metadata: {
          email,
          reason,
          errorCode,
          attemptedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  // ====================================================
  // 🔗 SHARED LINK & EXPORT HELPERS
  // (ported from the Admin panel's Send Reports / Dashboard export tools)
  // ====================================================

  const logGenerateSharedLink = useCallback(
    (report, extra = {}) => {
      const targetId =
        report?.firestoreDocId ||
        report?.id ||
        report?.incidentId ||
        report?.reportID ||
        report?.reportId ||
        report?.verifiedReportId ||
        report?.verifiedreportID ||
        'REPORT';
      return logMovement({
        action: 'GENERATE_SHARED_LINK',
        target: targetId,
        details: `Generated a shared link (target: ${extra?.target || 'unknown'}) for report ${targetId}`,
        metadata: {
          reportTitle: report?.reportTitle || report?.citizen || 'N/A',
          ...extra,
          generatedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logCopySharedLink = useCallback(
    (shortLink, target, incidentId) => {
      return logMovement({
        action: 'COPY_SHARED_LINK',
        target: incidentId || 'REPORT',
        details: `Copied the ${target || 'shared'} link for report ${incidentId || ''} to clipboard`,
        metadata: {
          shortLink: shortLink || 'N/A',
          target: target || 'N/A',
          copiedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  const logExportFilteredReports = useCallback(
    (format, count, extra = {}) => {
      return logMovement({
        action: 'EXPORT_FILTERED_REPORTS',
        target: format || 'EXPORT',
        details: `Exported ${count ?? 0} report(s) as ${format || 'file'}`,
        metadata: {
          format: format || 'N/A',
          count: count ?? 0,
          ...extra,
          exportedAt: new Date().toISOString(),
        },
      });
    },
    [logMovement]
  );

  return {
    logMovement,
    logAction,
    logAdminAction,

    // Admin CRUD Helpers
    logRegisterAdmin,
    logEditAdmin,
    logArchiveAdmin,
    logRestoreAdmin,

    // Citizen Management Helpers
    logViewCitizen,
    logRegisterCitizen,
    logEditCitizen,
    logToggleCitizenStatus,
    logArchiveCitizen,

    // SuperAdmin Profile & Security Helpers
    logSuperAdminProfileUpdate,
    logSuperAdminPasswordChange,

    // Authentication Audit Helpers
    logLoginSuccess,
    logLoginFailed,

    // Shared Link & Export Helpers
    logGenerateSharedLink,
    logCopySharedLink,
    logExportFilteredReports,
  };
};

export default useAuditLog;
