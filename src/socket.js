import { io } from 'socket.io-client';

const RAILWAY_BACKEND_URL = 'https://alertu-server-production.up.railway.app';

const configuredSocketUrl = (
  import.meta.env?.VITE_SOCKET_URL ||
  import.meta.env?.VITE_BACKEND_URL ||
  import.meta.env?.VITE_API_URL ||
  RAILWAY_BACKEND_URL
).trim();

// Socket.IO must use the backend origin, without /api.
const SOCKET_URL = configuredSocketUrl.replace(/\/+$/, '').replace(/\/api$/i, '');

// 2. Instantiate singleton Socket.IO instance tailored for SuperAdmin operations
export const socket = io(SOCKET_URL, {
  path: '/socket.io',
  autoConnect: true,
  reconnection: true,
  reconnectionAttempts: 25,
  reconnectionDelay: 1000,
  transports: ['polling', 'websocket'], // Start through polling, upgrade to WebSockets
  upgrade: true,
  withCredentials: true,
});

// Helper getter for dynamic socket access across components
export const getSocket = () => socket;

// Active state preservation across reconnects
const activeRooms = new Set(['admins', 'super_admins']);
let cachedUserData = null;

// Multi-subscriber callback set for Audit Logs & Admin Movements
const auditLogCallbacks = new Set();
const adminActionCallbacks = new Set();
const adminPresenceCallbacks = new Set();

// Central Event Handler for Administrative Movements & Audit Trail Signals
const handleAuditLogEvent = (data) => {
  console.log('🛡️ [SuperAdmin Audit Log Captured]:', data);
  auditLogCallbacks.forEach((callback) => callback(data));
};

const handleAdminActionEvent = (data) => {
  console.log('⚡ [Admin Action Event Received]:', data);
  adminActionCallbacks.forEach((callback) => callback(data));
  auditLogCallbacks.forEach((callback) => callback(data));
};

const handleAdminPresenceEvent = (data) => {
  console.log('👤 [Admin Presence Event Received]:', data);
  adminPresenceCallbacks.forEach((callback) => callback(data));
};

// Bind real-time event listeners across multiple event aliases
socket.on('AUDIT_LOG_EVENT', handleAuditLogEvent);
socket.on('ADMIN_ACTION_EVENT', handleAdminActionEvent);
socket.on('admin_action_event', handleAdminActionEvent);
socket.on('admin_movement_log', handleAuditLogEvent);
socket.on('admin_citizen_audit_log', handleAuditLogEvent);
socket.on('CITIZEN_REPORT_UPDATED', handleAdminActionEvent);

// Admin Presence events
socket.on('admin_presence_changed', handleAdminPresenceEvent);
socket.on('admin_presence', handleAdminPresenceEvent);

// ==========================================
// 🛡️ SUPERADMIN AUDIT LOG & ACTION LISTENERS
// ==========================================

/**
 * Register a callback to listen for real-time admin presence changes.
 */
export const onAdminPresenceChanged = (callback) => {
  if (typeof callback !== 'function') return () => {};
  adminPresenceCallbacks.add(callback);
  return () => adminPresenceCallbacks.delete(callback);
};

/**
 * Register a callback to listen for real-time audit logs and admin movements.
 * Returns an unsubscribe function for React useEffect cleanup.
 */
export const onAuditLogReceived = (callback) => {
  if (typeof callback !== 'function') return () => {};
  auditLogCallbacks.add(callback);
  return () => auditLogCallbacks.delete(callback);
};

/**
 * Register a callback to listen for specific admin UI actions (e.g. verifying, dispatching).
 */
export const onAdminActionReceived = (callback) => {
  if (typeof callback !== 'function') return () => {};
  adminActionCallbacks.add(callback);
  return () => adminActionCallbacks.delete(callback);
};

/**
 * Emit an administrative movement or audit log entry to the backend.
 */
export const emitAuditLog = (movementData) => {
  if (!socket.connected) {
    console.warn('⚠️ Audit log dropped: Socket offline.');
    return;
  }

  const payload = {
    eventId: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    action: movementData.action || 'ADMIN_MOVEMENT',
    target: movementData.target || 'SYSTEM',
    reportId: movementData.reportId || null,
    adminId: movementData.adminId || cachedUserData?.uid || 'SUPER_ADMIN',
    adminName: movementData.adminName || cachedUserData?.name || 'Super Admin',
    details: movementData.details || {},
    timestamp: new Date().toISOString(),
  };

  socket.emit('log_admin_movement', payload);
  console.log('📡 Emitted Admin Movement / Audit Log:', payload);
};

// ==========================================
// 📌 ROOM & USER PRESENCE MANAGERS
// ==========================================

/**
 * Join a specific socket room (e.g., 'super_admins', 'admins')
 */
export const joinSocketRoom = (roomName) => {
  if (!roomName) return;
  activeRooms.add(roomName);

  if (socket.connected) {
    socket.emit('join_room', roomName);
    socket.emit('joinSocketRoom', roomName);
    console.log(`📌 SuperAdmin joined room: ${roomName}`);
  }
};

/**
 * Leave a specific socket room
 */
export const leaveSocketRoom = (roomName) => {
  if (!roomName) return;
  activeRooms.delete(roomName);

  if (socket.connected) {
    socket.emit('leave_room', roomName);
    console.log(`🚪 SuperAdmin left room: ${roomName}`);
  }
};

/**
 * Authenticate and register SuperAdmin identity with the presence engine
 */
export const registerSocketUser = (userData) => {
  if (!userData) return;
  cachedUserData = { ...userData, role: 'superadmin' };

  if (socket.connected) {
    socket.emit('register_user', cachedUserData);
    socket.emit('user_online', cachedUserData);
    console.log(`👤 Registered SuperAdmin presence identity:`, cachedUserData);
  }
};

/**
 * Explicitly disconnect user presence upon logout
 */
export const disconnectSocketUser = () => {
  if (socket.connected && cachedUserData) {
    socket.emit('user_offline', cachedUserData);
  }
  cachedUserData = null;
  activeRooms.clear();
};

// ==========================================
// 🔄 CONNECTION & RECONNECTION LIFECYCLE
// ==========================================

socket.on('connect', () => {
  console.log(`⚡ Connected to AlertU Socket Server on Railway (ID: ${socket.id})`);

  // Ensure default administrative channels are joined
  joinSocketRoom('admins');
  joinSocketRoom('super_admins');

  // Restore presence state
  if (cachedUserData) {
    socket.emit('register_user', cachedUserData);
    setTimeout(() => {
      if (socket.connected) socket.emit('user_online', cachedUserData);
    }, 150);
  }

  // Re-subscribe to all active rooms upon reconnection
  activeRooms.forEach((roomName) => {
    socket.emit('join_room', roomName);
    socket.emit('joinSocketRoom', roomName);
  });
});

socket.on('connect_error', (error) => {
  console.warn('⚠️ Socket connection error:', error.message);
});

socket.on('disconnect', (reason) => {
  console.log('🔌 Socket disconnected:', reason);
});

export default socket;