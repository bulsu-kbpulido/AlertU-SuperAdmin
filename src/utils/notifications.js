// Central place for anything related to actually sending an alert.
//
// There is no real push/SMS/email provider wired into this project yet
// (no FCM, Twilio, or SendGrid integration exists in alertu_nodejs). The
// three "send*" functions below are stubs — replace their bodies with a
// real provider call when one exists. Everything that calls dispatchAlert()
// (currently just Send Test Alert in Settings.jsx) does not need to change
// when that happens.
import { isWithinQuietHours } from './quietHours';

export async function sendPushNotification(payload) {
  console.log('[stub] push notification:', payload);
  return { channel: 'push', delivered: false, reason: 'no push provider configured' };
}

export async function sendSmsAlert(payload) {
  console.log('[stub] sms alert:', payload);
  return { channel: 'sms', delivered: false, reason: 'no SMS provider configured' };
}

export async function sendEmailAlert(payload) {
  console.log('[stub] email alert:', payload);
  return { channel: 'email', delivered: false, reason: 'no email provider configured' };
}

const CHANNEL_SENDERS = {
  push: sendPushNotification,
  sms: sendSmsAlert,
  email: sendEmailAlert,
};

// Respects both the enabled-channel toggles and quiet hours. Returns which
// channels it attempted, whether it was suppressed by quiet hours, and the
// per-channel results (currently all "not delivered" since senders are stubs).
export async function dispatchAlert({ notifications, quietHours, payload, force = false }) {
  const activeChannels = Object.entries(notifications || {})
    .filter(([, enabled]) => enabled)
    .map(([channel]) => channel)
    .filter((channel) => CHANNEL_SENDERS[channel]);

  if (activeChannels.length === 0) {
    return { suppressed: false, activeChannels: [], results: [], reason: 'no_channels_enabled' };
  }

  if (!force && isWithinQuietHours(quietHours)) {
    return { suppressed: true, activeChannels, results: [], reason: 'quiet_hours' };
  }

  const results = await Promise.all(activeChannels.map((channel) => CHANNEL_SENDERS[channel](payload)));
  return { suppressed: false, activeChannels, results, reason: null };
}
