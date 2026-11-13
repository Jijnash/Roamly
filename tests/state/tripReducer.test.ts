import { describe, expect, it } from 'vitest'
import { tripReducer, UNDOABLE, RESETS_HISTORY, type TripAction } from '@/lib/state/tripReducer'
import { initHistory, withHistory } from '@/lib/state/history'
import { emptyTrip, toPlan, type Trip } from '@/lib/state/tripModel'
import type { Day } from '@/lib/contracts/types'

const input = { text: '3 days in Goa', interests: [], answers: {} }
const stop = (name: string) => ({ name, time: '09:00', duration: '1h', category: 'sight' as const, description: '', tip: '' })
const day = (title: string, ...names: string[]): Day => ({ title, stayArea: 'Panjim', stops: names.map(stop) })

/** A trip with two days built through the same stream events the server sends. */
function tripWithDays(): Trip {
  let trip = tripReducer(null, { type: 'STREAM_START', trip: emptyTrip(input, 0) })!
  trip = tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'meta', meta: { title: 'Goa', destination: 'Goa', summary: '', why: [] } } })!
  trip = tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'day', index: 0, day: day('Old Goa', 'A', 'B', 'C') } })!
  trip = tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'day', index: 1, day: day('Beaches', 'D') } })!
  return trip
}
const names = (trip: Trip | null, d = 0) => trip!.days[d].stops.map((s) => s.name)

describe('tripReducer: streaming', () => {
  it('builds a trip from stream events and gives every day and stop an id', () => {
    const trip = tripWithDays()
    expect(trip.meta.title).toBe('Goa')
    expect(trip.days.map((d) => d.title)).toEqual(['Old Goa', 'Beaches'])
    expect(new Set(trip.days.flatMap((d) => [d.id, ...d.stops.map((s) => s.id)])).size).toBe(6)
    expect(trip.days[0].stops[0].done).toBe(false)
  })

  it('places days by index (resume appends, a repeated index replaces) and ignores bad indexes', () => {
    let trip = tripWithDays()
    trip = tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'day', index: 2, day: day('South', 'E') } })!
    trip = tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'day', index: 0, day: day('Replaced', 'Z') } })!
    expect(trip.days.map((d) => d.title)).toEqual(['Replaced', 'Beaches', 'South'])
    expect(tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'day', index: 99, day: day('x', 'y') } })).toBe(trip)
  })

  it('collects warnings and ignores request-level events', () => {
    const trip = tripWithDays()
    const warned = tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'warning', message: 'Skipped a day' } })!
    expect(warned.warnings).toEqual(['Skipped a day'])
    expect(tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'retry', reason: 'x' } })).toBe(trip)
  })
})

describe('tripReducer: edits', () => {
  it('REMOVE_STOP removes by id', () => {
    const trip = tripWithDays()
    const b = trip.days[0].stops[1]
    expect(names(tripReducer(trip, { type: 'REMOVE_STOP', dayId: trip.days[0].id, stopId: b.id }))).toEqual(['A', 'C'])
  })

  it('MOVE_STOP moves within a day and clamps the target index', () => {
    const trip = tripWithDays()
    const [a, , c] = trip.days[0].stops
    expect(names(tripReducer(trip, { type: 'MOVE_STOP', dayId: trip.days[0].id, stopId: a.id, toIndex: 2 }))).toEqual(['B', 'C', 'A'])
    expect(names(tripReducer(trip, { type: 'MOVE_STOP', dayId: trip.days[0].id, stopId: c.id, toIndex: -5 }))).toEqual(['C', 'A', 'B'])
  })

  it('MOVE_STOP_TO_DAY moves a stop to the end of another day', () => {
    const trip = tripWithDays()
    const next = tripReducer(trip, { type: 'MOVE_STOP_TO_DAY', stopId: trip.days[0].stops[0].id, toDayId: trip.days[1].id })
    expect(names(next, 0)).toEqual(['B', 'C'])
    expect(names(next, 1)).toEqual(['D', 'A'])
  })

  it('EDIT_STOP cleans the input like AI output and keeps a stop named', () => {
    const trip = tripWithDays()
    const target = { dayId: trip.days[0].id, stopId: trip.days[0].stops[0].id }
    const edited = tripReducer(trip, { type: 'EDIT_STOP', ...target, changes: { name: '  New\nname ', time: '2pm', description: 'x'.repeat(500) } })!
    expect(edited.days[0].stops[0]).toMatchObject({ name: 'New name', time: '14:00' })
    expect(edited.days[0].stops[0].description.length).toBeLessThanOrEqual(200)
    expect(tripReducer(trip, { type: 'EDIT_STOP', ...target, changes: { name: '   ' } })).toBe(trip)
    expect(tripReducer(trip, { type: 'EDIT_STOP', ...target, changes: { name: 'A' } })).toBe(trip)
  })

  it('TOGGLE_DONE flips the flag and REMOVE_DAY removes the day', () => {
    const trip = tripWithDays()
    const toggled = tripReducer(trip, { type: 'TOGGLE_DONE', dayId: trip.days[0].id, stopId: trip.days[0].stops[0].id })!
    expect(toggled.days[0].stops[0].done).toBe(true)
    expect(tripReducer(trip, { type: 'REMOVE_DAY', dayId: trip.days[0].id })!.days.map((d) => d.title)).toEqual(['Beaches'])
  })

  it('REPLACE_PLAN swaps in a refined plan with fresh ids', () => {
    const trip = tripWithDays()
    const plan = { ...toPlan(trip), days: [day('Refined', 'Q')] }
    const next = tripReducer(trip, { type: 'REPLACE_PLAN', plan, warnings: ['w'] })!
    expect(next.days.map((d) => d.title)).toEqual(['Refined'])
    expect(next.days[0].stops[0].id).toBeTruthy()
    expect(next.warnings).toEqual(['w'])
    expect(next.input).toBe(trip.input)
  })

  it('returns the same state when the target is gone (an AI update replaced it)', () => {
    const trip = tripWithDays()
    const gone: TripAction[] = [
      { type: 'REMOVE_STOP', dayId: trip.days[0].id, stopId: 'missing' },
      { type: 'MOVE_STOP', dayId: 'missing', stopId: trip.days[0].stops[0].id, toIndex: 1 },
      { type: 'MOVE_STOP_TO_DAY', stopId: 'missing', toDayId: trip.days[1].id },
      { type: 'TOGGLE_DONE', dayId: trip.days[1].id, stopId: trip.days[0].stops[0].id },
      { type: 'REMOVE_DAY', dayId: 'missing' },
    ]
    for (const action of gone) expect(tripReducer(trip, action)).toBe(trip)
  })

  it('does nothing without a trip', () => {
    expect(tripReducer(null, { type: 'REMOVE_DAY', dayId: 'x' })).toBeNull()
  })
})

describe('withHistory', () => {
  const reducer = withHistory(tripReducer, { isUndoable: (a) => UNDOABLE.has(a.type), resets: (a) => RESETS_HISTORY.has(a.type), limit: 3 })
  const start = () => reducer(initHistory(null), { type: 'LOAD', trip: tripWithDays() })

  it('undoes and redoes edits', () => {
    let h = start()
    const original = h.present
    const dayId = h.present!.days[0].id
    h = reducer(h, { type: 'REMOVE_STOP', dayId, stopId: h.present!.days[0].stops[0].id })
    expect(names(h.present)).toEqual(['B', 'C'])
    h = reducer(h, { type: 'UNDO' })
    expect(h.present).toBe(original)
    h = reducer(h, { type: 'REDO' })
    expect(names(h.present)).toEqual(['B', 'C'])
  })

  it('a new edit clears the redo list', () => {
    let h = start()
    const dayId = h.present!.days[0].id
    h = reducer(h, { type: 'REMOVE_DAY', dayId })
    h = reducer(h, { type: 'UNDO' })
    h = reducer(h, { type: 'TOGGLE_DONE', dayId, stopId: h.present!.days[0].stops[0].id })
    expect(h.future).toEqual([])
  })

  it('does not record no-op edits or streaming events', () => {
    let h = start()
    h = reducer(h, { type: 'REMOVE_DAY', dayId: 'missing' })
    h = reducer(h, { type: 'STREAM_EVENT', event: { type: 'warning', message: 'x' } })
    expect(h.past).toHaveLength(0)
    expect(h.present!.warnings).toEqual(['x'])
  })

  it('a new generation (start or resume) clears history', () => {
    let h = start()
    h = reducer(h, { type: 'REMOVE_DAY', dayId: h.present!.days[0].id })
    expect(h.past).toHaveLength(1)
    h = reducer(h, { type: 'STREAM_RESUME' })
    expect(h.past).toHaveLength(0)
  })

  it('keeps at most `limit` undo steps', () => {
    let h = start()
    for (let i = 0; i < 5; i++) h = reducer(h, { type: 'TOGGLE_DONE', dayId: h.present!.days[1].id, stopId: h.present!.days[1].stops[0].id })
    expect(h.past).toHaveLength(3)
  })

  it('UNDO/REDO with nothing to do return the same history', () => {
    const h = start()
    expect(reducer(h, { type: 'UNDO' })).toBe(h)
    expect(reducer(h, { type: 'REDO' })).toBe(h)
  })
})

describe('tripReducer: packing list', () => {
  it('TOGGLE_PACKED ticks and unticks items that are on the list, and ignores others', () => {
    let trip = tripWithDays()
    trip = tripReducer(trip, { type: 'STREAM_EVENT', event: { type: 'info', info: { budget: null, packing: ['Sunscreen', 'Hat'], tips: [], safety: [], phrases: [] } } })!
    const packed = tripReducer(trip, { type: 'TOGGLE_PACKED', item: 'Hat' })!
    expect(packed.packed).toEqual(['Hat'])
    expect(tripReducer(packed, { type: 'TOGGLE_PACKED', item: 'Hat' })!.packed).toEqual([])
    expect(tripReducer(trip, { type: 'TOGGLE_PACKED', item: 'Passport' })).toBe(trip)
  })
})

describe('tripReducer: AI rewrites', () => {
  it('REPLACE_DAY swaps the day content but keeps its id and position', () => {
    const trip = tripWithDays()
    const next = tripReducer(trip, { type: 'REPLACE_DAY', dayId: trip.days[1].id, day: day('Islands', 'X', 'Y') })!
    expect(next.days[1]).toMatchObject({ id: trip.days[1].id, title: 'Islands' })
    expect(names(next, 1)).toEqual(['X', 'Y'])
  })

  it('REPLACE_STOP puts the chosen alternative in the same place with the same id', () => {
    const trip = tripWithDays()
    const target = trip.days[0].stops[1]
    const next = tripReducer(trip, { type: 'REPLACE_STOP', dayId: trip.days[0].id, stopId: target.id, stop: stop('Fort') })!
    expect(names(next)).toEqual(['A', 'Fort', 'C'])
    expect(next.days[0].stops[1].id).toBe(target.id)
    expect(tripReducer(trip, { type: 'REPLACE_STOP', dayId: trip.days[0].id, stopId: 'gone', stop: stop('Fort') })).toBe(trip)
  })
})
