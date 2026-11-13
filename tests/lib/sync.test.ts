import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSyncedTripStore, type PendingQueue } from '@/lib/storage/syncedTripStore'
import { summarize, type TripStore } from '@/lib/storage/tripStore'
import { emptyTrip, toTripDay, type Trip } from '@/lib/state/tripModel'

/** In-memory TripStore. `failing` makes every call throw, like an offline cloud. */
function memoryStore() {
  const trips = new Map<string, Trip>()
  let failing = false
  const guard = () => { if (failing) throw new Error('offline') }
  const store: TripStore = {
    async list() { guard(); return { trips: [...trips.values()].map(summarize), quarantined: 0 } },
    async get(id) { guard(); const t = trips.get(id); return t ? { status: 'ok', trip: structuredClone(t) } : { status: 'missing' } },
    async save(trip) { guard(); trips.set(trip.id, structuredClone(trip)); return 'local' },
    async remove(id) { guard(); trips.delete(id) },
  }
  return { store, trips, setFailing: (on: boolean) => { failing = on } }
}

function memoryQueue(): PendingQueue {
  let q = { saves: [] as string[], deletes: [] as string[] }
  return { load: () => q, store: (next) => { q = next } }
}

function trip(title: string, updatedAt: number): Trip {
  return {
    ...emptyTrip({ text: title, interests: [], answers: {} }),
    updatedAt,
    meta: { title, destination: '', summary: '', why: [] },
    days: [toTripDay({ title: 'D1', stayArea: '', stops: [{ name: 'A', time: '', duration: '', category: 'sight', description: '', tip: '' }] })],
  }
}

function setup({ signedIn = true } = {}) {
  const local = memoryStore()
  const cloud = memoryStore()
  const queue = memoryQueue()
  const synced = createSyncedTripStore(local.store, async () => (signedIn ? cloud.store : null), queue)
  return { local, cloud, queue, synced }
}

describe('synced trip store', () => {
  it('signed out: saves locally only', async () => {
    const { local, cloud, synced } = setup({ signedIn: false })
    expect(await synced.save(trip('A', 1))).toBe('local')
    expect(local.trips.size).toBe(1)
    expect(cloud.trips.size).toBe(0)
    expect(await synced.syncAll()).toEqual({ status: 'off' })
  })

  it('signed in: saves to both', async () => {
    const { local, cloud, synced } = setup()
    expect(await synced.save(trip('A', 1))).toBe('synced')
    expect(local.trips.size).toBe(1)
    expect(cloud.trips.size).toBe(1)
  })

  it('cloud down: keeps the local save and queues it, then syncAll catches up', async () => {
    const { cloud, synced } = setup()
    cloud.setFailing(true)
    const t = trip('A', 1)
    expect(await synced.save(t)).toBe('pending')
    expect(synced.pendingCount()).toBe(1)

    cloud.setFailing(false)
    expect(await synced.syncAll()).toEqual({ status: 'done', pushed: 1, pulled: 0, failed: 0 })
    expect(cloud.trips.has(t.id)).toBe(true)
    expect(synced.pendingCount()).toBe(0)
  })

  it('a delete made offline is replayed and does not get pulled back', async () => {
    const { cloud, synced } = setup()
    const t = trip('A', 1)
    await synced.save(t)
    cloud.setFailing(true)
    await synced.remove(t.id)
    expect(synced.pendingCount()).toBe(1)

    cloud.setFailing(false)
    await synced.syncAll()
    expect(cloud.trips.has(t.id)).toBe(false)
    expect((await synced.list()).trips).toEqual([])
  })

  it('syncAll: newer copy wins on each side (last write wins)', async () => {
    const { local, cloud, synced } = setup()
    const shared = trip('Shared', 100)
    local.trips.set(shared.id, { ...shared, meta: { ...shared.meta, title: 'Edited here' }, updatedAt: 200 })
    cloud.trips.set(shared.id, shared)
    const fromPhone = trip('From phone', 50)
    cloud.trips.set(fromPhone.id, fromPhone)
    const onlyHere = trip('Only here', 10)
    local.trips.set(onlyHere.id, onlyHere)

    expect(await synced.syncAll()).toEqual({ status: 'done', pushed: 2, pulled: 1, failed: 0 })
    expect(cloud.trips.get(shared.id)!.meta.title).toBe('Edited here')
    expect(local.trips.get(fromPhone.id)!.meta.title).toBe('From phone')
    expect(cloud.trips.has(onlyHere.id)).toBe(true)
  })

  it('get: a trip missing here is fetched from the cloud and kept locally', async () => {
    const { local, cloud, synced } = setup()
    const t = trip('Elsewhere', 1)
    cloud.trips.set(t.id, t)
    expect((await synced.get(t.id)).status).toBe('ok')
    expect(local.trips.has(t.id)).toBe(true)
  })
})

describe('Supabase migration', () => {
  const sql = readFileSync('supabase/migrations/0001_trips.sql', 'utf8')

  it('enables row-level security with an owner check on every operation', () => {
    expect(sql).toMatch(/alter table public\.trips enable row level security/i)
    for (const op of ['select', 'insert', 'update', 'delete']) {
      expect(sql).toMatch(new RegExp(`for ${op} (using|with check) \\(auth\\.uid\\(\\) = user_id\\)`, 'i'))
    }
  })
})
