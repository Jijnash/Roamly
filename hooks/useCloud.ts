'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { cloudConfigured, supabase } from '@/lib/cloud/supabase'
import { tripStore } from '@/lib/storage/appStore'
import { emitTripsChanged } from '@/lib/storage/events'
import type { SyncReport } from '@/lib/storage/syncedTripStore'

/**
 * Sign-in and sync state, shared by every component that shows it (a tiny
 * module-level store read with useSyncExternalStore, like useOnline/useTheme).
 *
 * Sign-in is a passwordless email link (Supabase magic link). After signing in,
 * and whenever the browser comes back online, all trips are synced.
 */

export type CloudState = {
  configured: boolean
  ready: boolean
  email: string | null
  syncing: boolean
  lastSync: { at: number; report: SyncReport } | null
  syncError: string | null
}

let state: CloudState = { configured: cloudConfigured, ready: !cloudConfigured, email: null, syncing: false, lastSync: null, syncError: null }
const listeners = new Set<() => void>()
const set = (patch: Partial<CloudState>) => {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

export async function syncNow(): Promise<void> {
  if (!state.email || state.syncing) return
  set({ syncing: true, syncError: null })
  try {
    const report = await tripStore().syncAll()
    set({ syncing: false, lastSync: { at: Date.now(), report } })
    if (report.status === 'done' && report.pulled > 0) emitTripsChanged()
  } catch (err) {
    console.warn('[sync] failed', err)
    set({ syncing: false, syncError: "Couldn't sync. Your trips are safe on this device; we'll try again." })
  }
}

/** Sends the sign-in link. Returns an error message, or null on success. */
export async function sendSignInLink(email: string): Promise<string | null> {
  const db = supabase()
  if (!db) return 'Cloud sync is not set up on this server.'
  const { error } = await db.auth.signInWithOtp({ email, options: { emailRedirectTo: `${window.location.origin}/trips` } })
  if (!error) return null
  // Supabase's built-in email sender is rate-limited; say so plainly rather than echoing raw errors.
  return error.status === 429 ? 'Too many sign-in emails right now. Please wait a minute and try again.' : "Couldn't send the link. Check the address and try again."
}

export async function signOut(): Promise<void> {
  await supabase()?.auth.signOut()
}

let started = false
function start() {
  const db = supabase()
  if (started || !db) return
  started = true
  void db.auth.getSession().then(({ data }) => {
    set({ ready: true, email: data.session?.user.email ?? null })
    if (data.session) void syncNow()
  })
  db.auth.onAuthStateChange((event, session) => {
    set({ ready: true, email: session?.user.email ?? null })
    if (event === 'SIGNED_IN') void syncNow()
  })
  window.addEventListener('online', () => void syncNow())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCloud(): CloudState {
  useEffect(start, [])
  return useSyncExternalStore(subscribe, () => state, () => state)
}
