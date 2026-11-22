'use client';

import { useEffect } from 'react';

/** Registers the PWA service worker (push + offline shell). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    // Only register in production or when explicitly testing PWA locally.
    if (process.env.NODE_ENV !== 'production' && !window.location.hostname.includes('localhost')) {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* non-fatal */
    });
  }, []);

  return null;
}
