import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Trip } from '@/lib/state/tripModel'
import { CorruptTripError, parseStoredTrip } from '@/lib/storage/tripSchema'

/**
 * Where trips are saved. The app only talks to the TripStore interface; the
 * IndexedDB version is below, the Supabase one is in supabaseTripStore.ts, and
 * syncedTripStore.ts combines them. lib/storage/appStore.ts builds the one the app uses.
 */

export type TripSummary = { id: string; title: string; destination: string; text: string; dayCount: number; updatedAt: number }

export type LoadResult = { status: 'ok'; trip: Trip } | { status: 'missing' } | { status: 'corrupt' }

/** Where a save landed: only on this device, also in the cloud, or queued for the cloud (offline or failed). */
export type SaveResult = 'local' | 'synced' | 'pending'

export interface TripStore {
  /** Newest first. Unreadable records are moved aside and counted in `quarantined`. */
  list(): Promise<{ trips: TripSummary[]; quarantined: number }>
  get(id: string): Promise<LoadResult>
  save(trip: Trip): Promise<SaveResult>
  remove(id: string): Promise<void>
}

interface RoamlyDB extends DBSchema {
  trips: { key: string; value: Record<string, unknown> & { id: string } }
  /** Records that failed validation are kept here (not deleted) so nothing is silently lost. */
  quarantine: { key: number; value: { record: unknown; reason: string; at: number } }
}

export function summarize(trip: Trip): TripSummary {
  return {
    id: trip.id,
    title: trip.meta.title || 'Untitled trip',
    destination: trip.meta.destination,
    text: trip.input.text,
    dayCount: trip.days.length,
    updatedAt: trip.updatedAt,
  }
}

export function createIdbTripStore(dbName = 'roamly'): TripStore {
  let dbPromise: Promise<IDBPDatabase<RoamlyDB>> | null = null
  const db = () => {
    dbPromise ??= openDB<RoamlyDB>(dbName, 1, {
      upgrade(database) {
        database.createObjectStore('trips', { keyPath: 'id' })
        database.createObjectStore('quarantine', { autoIncrement: true })
      },
    })
    return dbPromise
  }

  async function quarantine(record: unknown, id: string | undefined, err: unknown) {
    const reason = err instanceof CorruptTripError ? err.message : 'unreadable'
    console.warn(`[store] moved unreadable trip ${id ?? '?'} aside: ${reason}`)
    const tx = (await db()).transaction(['trips', 'quarantine'], 'readwrite')
    await Promise.all([
      tx.objectStore('quarantine').add({ record, reason, at: Date.now() }),
      id ? tx.objectStore('trips').delete(id) : Promise.resolve(),
      tx.done,
    ])
  }

  return {
    async list() {
      const records = await (await db()).getAll('trips')
      const trips: TripSummary[] = []
      let quarantined = 0
      for (const record of records) {
        try {
          trips.push(summarize(parseStoredTrip(record)))
        } catch (err) {
          quarantined++
          await quarantine(record, record?.id, err)
        }
      }
      trips.sort((a, b) => b.updatedAt - a.updatedAt)
      return { trips, quarantined }
    },

    async get(id) {
      const record = await (await db()).get('trips', id)
      if (!record) return { status: 'missing' }
      try {
        return { status: 'ok', trip: parseStoredTrip(record) }
      } catch (err) {
        await quarantine(record, id, err)
        return { status: 'corrupt' }
      }
    },

    async save(trip) {
      // Stored as plain data (structured clone), validated again on the way back in.
      await (await db()).put('trips', { ...trip })
      return 'local'
    },

    async remove(id) {
      await (await db()).delete('trips', id)
    },
  }
}
