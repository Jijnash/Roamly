'use client'

import { useSyncExternalStore } from 'react'

/**
 * True while the browser reports a network connection.
 * useSyncExternalStore subscribes to the browser's online/offline events and
 * re-renders when they fire. On the server (no navigator) we assume online.
 */
function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true)
}

export const OFFLINE_REASON = "You're offline. AI needs a connection; your plan and edits still work."
