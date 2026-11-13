'use client'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The browser's Supabase client, or null when cloud sync isn't configured.
 * Both values are public by design: the anon key only allows what the
 * row-level-security policies in supabase/migrations allow (each user, own trips).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
const anonKey =
  (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)?.trim() ?? ''

export const cloudConfigured = url !== '' && anonKey !== ''

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient | null {
  if (!cloudConfigured || typeof window === 'undefined') return null
  // Magic links come back with the session in the URL; detectSessionInUrl picks it up.
  client ??= createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  return client
}
