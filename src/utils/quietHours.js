// Pure, side-effect-free check for whether "now" falls inside a configured
// quiet-hours window. Handles overnight windows (e.g. 22:00 -> 06:00) where
// start > end and the window wraps past midnight.
//
// quietHours shape: { enabled: boolean, start: 'HH:MM', end: 'HH:MM' }
// referenceDate: optional Date, defaults to now — pass one in for testing.
export function isWithinQuietHours(quietHours, referenceDate = new Date()) {
  if (!quietHours || !quietHours.enabled) return false;
  if (!quietHours.start || !quietHours.end) return false;

  const [startH, startM] = quietHours.start.split(':').map(Number);
  const [endH, endM] = quietHours.end.split(':').map(Number);
  if ([startH, startM, endH, endM].some((n) => Number.isNaN(n))) return false;

  const nowMinutes = referenceDate.getHours() * 60 + referenceDate.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes === endMinutes) return false;

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}
