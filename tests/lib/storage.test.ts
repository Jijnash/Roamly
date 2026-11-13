import 'fake-indexeddb/auto' // a real IndexedDB implementation for Node, so the store is tested for real
import { describe, expect, it } from 'vitest'
import { CorruptTripError, parseStoredTrip } from '@/lib/storage/tripSchema'
import { createIdbTripStore } from '@/lib/storage/tripStore'
import { emptyTrip, toTripDay, type Trip } from '@/lib/state/tripModel'

function sampleTrip(title = 'Goa'): Trip {
  const trip = emptyTrip({ text: '3 days in Goa', interests: ['food'], answers: { origin: 'Hyderabad' } })
  return {
    ...trip,
    meta: { title, destination: 'Goa', summary: '', why: [] },
    days: [toTripDay({ title: 'Old Goa', stayArea: 'Panjim', stops: [{ name: 'Se Cathedral', time: '10:00', duration: '1h', category: 'sight', description: '', tip: '' }] })],
    info: { budget: null, packing: ['Sunscreen'], tips: [], safety: [], phrases: [] },
    packed: ['Sunscreen'],
  }
}

let dbCounter = 0
const freshStore = () => createIdbTripStore(`roamly-test-${++dbCounter}`)

describe('parseStoredTrip', () => {
  it('round-trips a valid trip unchanged, keeping ids and done flags', () => {
    const trip = sampleTrip()
    trip.days[0].stops[0].done = true
    expect(parseStoredTrip(structuredClone(trip))).toEqual(trip)
  })

  it('rejects records without the essentials', () => {
    expect(() => parseStoredTrip(null)).toThrow(CorruptTripError)
    expect(() => parseStoredTrip({ id: 'trip_abcd1234', days: 'x', input: { text: 'x' } })).toThrow(/days/)
    expect(() => parseStoredTrip({ ...sampleTrip(), id: '../etc' })).toThrow(/id/)
    expect(() => parseStoredTrip({ ...sampleTrip(), days: [] })).toThrow(/no days/)
  })

  it('refuses a record saved by a newer app version', () => {
    expect(() => parseStoredTrip({ ...sampleTrip(), schemaVersion: 99 })).toThrow(/newer version/)
  })

  it('cleans tampered fields instead of trusting them', () => {
    const raw = structuredClone(sampleTrip()) as unknown as Record<string, any>
    raw.days[0].stops.push({ id: 'stop_zzzz9999', time: '09:00' }) // no name: dropped
    raw.days[0].stops[0].category = '<img src=x>'
    raw.days[0].stops[0].done = 'yes' // not a boolean: false
    raw.transport = 'garbage'
    const trip = parseStoredTrip(raw)
    expect(trip.days[0].stops).toHaveLength(1)
    expect(trip.days[0].stops[0]).toMatchObject({ category: 'other', done: false })
    expect(trip.transport).toEqual([])
  })
})

describe('IndexedDB trip store', () => {
  it('saves, lists newest first, loads and removes', async () => {
    const store = freshStore()
    const older = { ...sampleTrip('Older'), updatedAt: 1000 }
    const newer = { ...sampleTrip('Newer'), updatedAt: 2000 }
    await store.save(older)
    await store.save(newer)

    const { trips, quarantined } = await store.list()
    expect(trips.map((t) => t.title)).toEqual(['Newer', 'Older'])
    expect(quarantined).toBe(0)

    expect(await store.get(older.id)).toEqual({ status: 'ok', trip: older })
    await store.remove(older.id)
    expect(await store.get(older.id)).toEqual({ status: 'missing' })
  })

  it('moves a damaged record aside instead of crashing the list', async () => {
    const store = freshStore()
    await store.save(sampleTrip('Good'))
    await store.save({ id: 'trip_broken0001', days: 'nope' } as unknown as Trip)

    const first = await store.list()
    expect(first.trips.map((t) => t.title)).toEqual(['Good'])
    expect(first.quarantined).toBe(1)
    // It was moved out of the trips store, so it's reported once, not on every visit.
    expect((await store.list()).quarantined).toBe(0)
  })

  it('reports a damaged record opened by id as corrupt', async () => {
    const store = freshStore()
    await store.save({ ...sampleTrip(), days: [] })
    const { trips } = await store.list().catch(() => ({ trips: [] }))
    expect(trips).toEqual([])
    const bad = { ...sampleTrip(), input: null } as unknown as Trip
    await store.save(bad)
    expect(await store.get(bad.id)).toEqual({ status: 'corrupt' })
  })
})
