import type { SupabaseClient } from '@supabase/supabase-js'
import type { Trip } from '@/lib/state/tripModel'
import { parseStoredTrip } from '@/lib/storage/tripSchema'
import { summarize, type LoadResult, type TripStore, type TripSummary } from '@/lib/storage/tripStore'
import { supabase } from '@/lib/cloud/supabase'

/**
 * TripStore backed by the Supabase `trips` table (one row per trip, JSON in `data`).
 * Row-level security limits every query to the signed-in user's rows, so these
 * queries don't (and mustn't need to) filter by user themselves.
 * Cloud data is untrusted like any other input: every row is re-validated.
 */
export function createSupabaseTripStore(db: SupabaseClient): TripStore {
  return {
    async list() {
      const { data, error } = await db.from('trips').select('id, data').order('updated_at', { ascending: false })
      if (error) throw new Error(`cloud list failed: ${error.message}`)
      const trips: TripSummary[] = []
      let quarantined = 0
      for (const row of data ?? []) {
        try {
          trips.push(summarize(parseStoredTrip(row.data)))
        } catch {
          quarantined++ // left in the cloud untouched; the local copy (if any) is what's shown
        }
      }
      return { trips, quarantined }
    },

    async get(id): Promise<LoadResult> {
      const { data, error } = await db.from('trips').select('data').eq('id', id).maybeSingle()
      if (error) throw new Error(`cloud get failed: ${error.message}`)
      if (!data) return { status: 'missing' }
      try {
        return { status: 'ok', trip: parseStoredTrip(data.data) }
      } catch {
        return { status: 'corrupt' }
      }
    },

    async save(trip: Trip) {
      const { error } = await db.from('trips').upsert({ id: trip.id, data: trip, updated_at: new Date(trip.updatedAt).toISOString() })
      if (error) throw new Error(`cloud save failed: ${error.message}`)
      return 'synced'
    },

    async remove(id) {
      const { error } = await db.from('trips').delete().eq('id', id)
      if (error) throw new Error(`cloud delete failed: ${error.message}`)
    },
  }
}

/** The cloud store for the signed-in user, or null when signed out / not configured. */
export async function currentCloudStore(): Promise<TripStore | null> {
  const db = supabase()
  if (!db) return null
  const { data } = await db.auth.getSession()
  return data.session ? createSupabaseTripStore(db) : null
}
