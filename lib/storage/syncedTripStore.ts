import type { SaveResult, TripStore, TripSummary } from '@/lib/storage/tripStore'

/**
 * Local-first sync between this device (IndexedDB) and the cloud (Supabase).
 *
 *  - Every read and write goes to the local store first, so the app works the
 *    same offline, signed out, or with no cloud configured at all.
 *  - While signed in, each save/delete is also sent to the cloud. If that fails
 *    (offline, server error), the trip id goes on a small "pending" queue.
 *  - syncAll() (on sign-in, on reconnect, or from "Sync now") replays the queue
 *    and reconciles both sides: for each trip, the copy with the newer
 *    `updatedAt` wins. This is "last write wins": simple and predictable, but if
 *    the same trip is edited on two devices while offline, the older edit is lost.
 */

export type PendingQueue = {
  load(): { saves: string[]; deletes: string[] }
  store(queue: { saves: string[]; deletes: string[] }): void
}

export type SyncReport = { status: 'off' } | { status: 'done'; pushed: number; pulled: number; failed: number }

export type SyncedTripStore = TripStore & {
  syncAll(): Promise<SyncReport>
  pendingCount(): number
}

const unique = (ids: string[]) => [...new Set(ids)]

export function createSyncedTripStore(
  local: TripStore,
  cloud: () => Promise<TripStore | null>,
  pending: PendingQueue,
): SyncedTripStore {
  const update = (change: (q: { saves: string[]; deletes: string[] }) => { saves: string[]; deletes: string[] }) => {
    const next = change(pending.load())
    pending.store({ saves: unique(next.saves), deletes: unique(next.deletes) })
  }
  const getCloud = () => cloud().catch(() => null)

  return {
    list: () => local.list(),

    async get(id) {
      const result = await local.get(id)
      if (result.status !== 'missing') return result
      // Not on this device (e.g. opened a link on a new phone): try the cloud and keep a local copy.
      const remote = await getCloud()
      if (!remote) return result
      const fromCloud = await remote.get(id).catch(() => result)
      if (fromCloud.status === 'ok') await local.save(fromCloud.trip)
      return fromCloud
    },

    async save(trip): Promise<SaveResult> {
      await local.save(trip)
      const remote = await getCloud()
      if (!remote) return 'local'
      try {
        await remote.save(trip)
        update((q) => ({ ...q, saves: q.saves.filter((id) => id !== trip.id) }))
        return 'synced'
      } catch {
        update((q) => ({ ...q, saves: [...q.saves, trip.id] }))
        return 'pending'
      }
    },

    async remove(id) {
      await local.remove(id)
      update((q) => ({ saves: q.saves.filter((s) => s !== id), deletes: q.deletes }))
      const remote = await getCloud()
      if (!remote) return
      try {
        await remote.remove(id)
      } catch {
        update((q) => ({ ...q, deletes: [...q.deletes, id] }))
      }
    },

    pendingCount() {
      const q = pending.load()
      return q.saves.length + q.deletes.length
    },

    async syncAll(): Promise<SyncReport> {
      const remote = await getCloud()
      if (!remote) return { status: 'off' }
      let pushed = 0
      let pulled = 0
      let failed = 0

      // 1. Deletes made while offline.
      const queue = pending.load()
      const stillDeleting: string[] = []
      for (const id of queue.deletes) {
        try {
          await remote.remove(id)
        } catch {
          stillDeleting.push(id)
          failed++
        }
      }

      // 2. Reconcile: newer copy wins on each side.
      const [localList, remoteList] = await Promise.all([local.list(), remote.list()])
      const localById = new Map<string, TripSummary>(localList.trips.map((t) => [t.id, t]))
      const remoteById = new Map<string, TripSummary>(remoteList.trips.map((t) => [t.id, t]))

      for (const [id, theirs] of remoteById) {
        if (stillDeleting.includes(id)) continue // deleted here; don't bring it back
        const mine = localById.get(id)
        if (mine && mine.updatedAt >= theirs.updatedAt) continue
        const result = await remote.get(id).catch(() => null)
        if (result?.status === 'ok') {
          await local.save(result.trip)
          pulled++
        }
      }

      const stillSaving: string[] = []
      for (const [id, mine] of localById) {
        const theirs = remoteById.get(id)
        if (theirs && theirs.updatedAt >= mine.updatedAt) continue
        const result = await local.get(id)
        if (result.status !== 'ok') continue
        try {
          await remote.save(result.trip)
          pushed++
        } catch {
          stillSaving.push(id)
          failed++
        }
      }

      pending.store({ saves: stillSaving, deletes: stillDeleting })
      return { status: 'done', pushed, pulled, failed }
    },
  }
}

/** Pending queue kept in localStorage (tiny: just trip ids). Falls back to memory if storage is blocked. */
export function browserPendingQueue(key = 'roamly:pending-sync'): PendingQueue {
  let memory = { saves: [] as string[], deletes: [] as string[] }
  return {
    load() {
      try {
        const raw = JSON.parse(localStorage.getItem(key) ?? 'null')
        if (raw && Array.isArray(raw.saves) && Array.isArray(raw.deletes)) {
          return { saves: raw.saves.filter((x: unknown) => typeof x === 'string'), deletes: raw.deletes.filter((x: unknown) => typeof x === 'string') }
        }
      } catch {
        // fall through to memory
      }
      return memory
    },
    store(queue) {
      memory = queue
      try {
        localStorage.setItem(key, JSON.stringify(queue))
      } catch {
        // storage blocked: keep it in memory for this session
      }
    },
  }
}
