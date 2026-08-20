import { useEffect, useRef } from 'react';

const STORAGE_KEY = 'alertu_last_activity';
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

// Calls onIdle once the user has been inactive for timeoutMinutes.
// - timeoutMinutes <= 0 disables the timer entirely (the "Never" option).
// - Activity is tracked via localStorage + the 'storage' event, so
//   interacting in one tab resets the clock in every open tab too.
// - Backgrounded tabs stop firing DOM events, so on becoming visible again
//   the elapsed time is re-checked immediately instead of waiting on the
//   next poll.
export function useIdleTimer(timeoutMinutes, onIdle) {
  const onIdleRef = useRef(onIdle);

  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!timeoutMinutes || timeoutMinutes <= 0) return undefined;

    const timeoutMs = timeoutMinutes * 60 * 1000;
    let firedIdle = false;

    const getLastActivity = () => Number(localStorage.getItem(STORAGE_KEY)) || Date.now();

    const markActivity = () => {
      firedIdle = false;
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
    };

    const checkIdle = () => {
      if (firedIdle) return;
      const elapsed = Date.now() - getLastActivity();
      if (elapsed >= timeoutMs) {
        firedIdle = true;
        onIdleRef.current?.();
      }
    };

    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY) checkIdle();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkIdle();
    };

    markActivity();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, markActivity, { passive: true }));
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    const intervalId = setInterval(checkIdle, 15 * 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, markActivity));
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [timeoutMinutes]);
}
