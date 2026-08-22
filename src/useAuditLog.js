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

  return {
    logMovement,
    logAction,
    logAdminAction,

    // Admin CRUD Helpers
    logRegisterAdmin,
    logEditAdmin,
    logArchiveAdmin,
    logRestoreAdmin,

    // SuperAdmin Profile & Security Helpers
    logSuperAdminProfileUpdate,
    logSuperAdminPasswordChange,

    // Authentication Audit Helpers
    logLoginSuccess,
    logLoginFailed,
  };
};

export default useAuditLog;
