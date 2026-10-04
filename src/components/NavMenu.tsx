'use client';
import { useState } from 'react';

/** Collapses the main navigation into a menu button below 1200px. */
export default function NavMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="menu-toggle" aria-expanded={open} aria-controls="main-nav" onClick={() => setOpen((o) => !o)}>
        {open ? 'Close' : 'Menu'}
      </button>
      <nav id="main-nav" aria-label="Main" className={open ? 'open' : ''} onClick={() => setOpen(false)}>{children}</nav>
    </>
  );
}
