'use client';
import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 15 * 60_000;
const WARN_MS = 60_000;

/** Signs the user out after 15 minutes with no mouse, key, scroll or touch activity, and keeps the
 *  server session alive while the user is active (so a long form is not lost). */
export default function IdleLogout({ logoutAction }: { logoutAction: () => Promise<void> }) {
  const last = useRef(Date.now());
  const lastPing = useRef(Date.now());
  const [warn, setWarn] = useState(false);
  useEffect(() => {
    const bump = () => { last.current = Date.now(); setWarn(false); };
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      const idle = Date.now() - last.current;
      if (idle >= IDLE_MS) { clearInterval(t); void logoutAction(); return; }
      setWarn(idle >= IDLE_MS - WARN_MS);
      if (idle < 60_000 && Date.now() - lastPing.current > 4 * 60_000) {
        lastPing.current = Date.now();
        void fetch('/api/health?ping=1', { cache: 'no-store' }).catch(() => {});
      }
    }, 5_000);
    return () => { clearInterval(t); events.forEach((e) => window.removeEventListener(e, bump)); };
  }, [logoutAction]);
  if (!warn) return null;
  return (
    <div className="notice notice--warning" role="alert" style={{ position: 'fixed', bottom: 16, right: 16, zIndex: 40, maxWidth: 360 }}>
      <strong>Signing out soon.</strong>You will be signed out in under a minute because there has been no activity. Move the mouse or press a key to stay signed in.
    </div>
  );
}
