import { LIMITS } from '@/lib/limits'
import { cleanText } from '@/lib/contracts/clean'
import { normalizeTime } from '@/lib/contracts/plan'
import type { Day, Plan, PlanEvent, Stop } from '@/lib/contracts/types'
import { toTripDay, type Trip, type TripDay } from '@/lib/state/tripModel'

/**
 * Every change to a trip goes through this reducer, so all edits are in one
 * place, easy to test, and easy to undo (see history.ts).
 *
 * Edits target items by id. If the target no longer exists (e.g. an AI update
 * replaced the day), the action does nothing and returns the same state object,
 * which also tells the history wrapper not to record an undo step.
 */

export type StopEdit = Partial<Pick<Stop, 'name' | 'time' | 'duration' | 'description' | 'tip'>>

export type TripAction =
  | { type: 'LOAD'; trip: Trip | null }
  | { type: 'STREAM_START'; trip: Trip }
  | { type: 'STREAM_RESUME' }
  | { type: 'STREAM_EVENT'; event: PlanEvent }
  | { type: 'REPLACE_PLAN'; plan: Plan; warnings: string[] }
  | { type: 'REMOVE_STOP'; dayId: string; stopId: string }
  | { type: 'MOVE_STOP'; dayId: string; stopId: string; toIndex: number }
  | { type: 'MOVE_STOP_TO_DAY'; stopId: string; toDayId: string }
  | { type: 'EDIT_STOP'; dayId: string; stopId: string; changes: StopEdit }
  | { type: 'TOGGLE_DONE'; dayId: string; stopId: string }
  | { type: 'REMOVE_DAY'; dayId: string }
  | { type: 'TOGGLE_PACKED'; item: string }
  | { type: 'REPLACE_DAY'; dayId: string; day: Day }
  | { type: 'REPLACE_STOP'; dayId: string; stopId: string; stop: Stop }

/** Actions the user can undo. Streaming is not undoable: it builds the trip rather than editing it. */
export const UNDOABLE: ReadonlySet<TripAction['type']> = new Set([
  'REPLACE_PLAN', 'REMOVE_STOP', 'MOVE_STOP', 'MOVE_STOP_TO_DAY', 'EDIT_STOP', 'TOGGLE_DONE', 'REMOVE_DAY', 'TOGGLE_PACKED', 'REPLACE_DAY', 'REPLACE_STOP',
])

/** Actions that start a new AI generation; undo history before them is cleared. */
export const RESETS_HISTORY: ReadonlySet<TripAction['type']> = new Set(['LOAD', 'STREAM_START', 'STREAM_RESUME'])

const MAX_WARNINGS = 20

export type TripState = Trip | null

export function tripReducer(state: TripState, action: TripAction): TripState {
  if (action.type === 'LOAD') return action.trip
  if (action.type === 'STREAM_START') return action.trip
  if (!state) return state

  switch (action.type) {
    case 'STREAM_RESUME':
      return state

    case 'STREAM_EVENT':
      return applyStreamEvent(state, action.event)

    case 'REPLACE_PLAN':
      return {
        ...state,
        ...action.plan,
        days: action.plan.days.map(toTripDay),
        warnings: [...state.warnings, ...action.warnings].slice(-MAX_WARNINGS),
      }

    case 'REMOVE_STOP':
      return updateDay(state, action.dayId, (day) => {
        const stops = day.stops.filter((s) => s.id !== action.stopId)
        return stops.length === day.stops.length ? day : { ...day, stops }
      })

    case 'MOVE_STOP':
      return updateDay(state, action.dayId, (day) => {
        const from = day.stops.findIndex((s) => s.id === action.stopId)
        const to = Math.max(0, Math.min(action.toIndex, day.stops.length - 1))
        if (from === -1 || from === to) return day
        const stops = [...day.stops]
        const [moved] = stops.splice(from, 1)
        stops.splice(to, 0, moved)
        return { ...day, stops }
      })

    case 'MOVE_STOP_TO_DAY': {
      const fromDay = state.days.find((d) => d.stops.some((s) => s.id === action.stopId))
      const toDay = state.days.find((d) => d.id === action.toDayId)
      if (!fromDay || !toDay || fromDay === toDay) return state
      const stop = fromDay.stops.find((s) => s.id === action.stopId)!
      return {
        ...state,
        days: state.days.map((d) => {
          if (d === fromDay) return { ...d, stops: d.stops.filter((s) => s.id !== action.stopId) }
          if (d === toDay) return { ...d, stops: [...d.stops, stop] }
          return d
        }),
      }
    }

    case 'EDIT_STOP':
      return updateStop(state, action.dayId, action.stopId, (stop) => {
        // User edits get the same cleaning and limits as AI output.
        const c = action.changes
        const next = {
          ...stop,
          ...(c.name !== undefined && { name: cleanText(c.name, LIMITS.nameChars) }),
          ...(c.time !== undefined && { time: c.time.trim() === '' ? '' : normalizeTime(c.time) || stop.time }),
          ...(c.duration !== undefined && { duration: cleanText(c.duration, LIMITS.shortChars) }),
          ...(c.description !== undefined && { description: cleanText(c.description, LIMITS.descriptionChars) }),
          ...(c.tip !== undefined && { tip: cleanText(c.tip, LIMITS.tipChars) }),
        }
        if (!next.name) return stop // a stop must keep a name
        const changed = (Object.keys(next) as (keyof typeof next)[]).some((k) => next[k] !== stop[k])
        return changed ? next : stop
      })

    case 'TOGGLE_DONE':
      return updateStop(state, action.dayId, action.stopId, (stop) => ({ ...stop, done: !stop.done }))

    case 'REPLACE_DAY':
      // An AI rewrite of one day. The day keeps its id (so its card stays in place); stops are new.
      return updateDay(state, action.dayId, (day) => ({ ...toTripDay(action.day), id: day.id }))

    case 'REPLACE_STOP':
      // "Swap with AI": the chosen alternative takes the old stop's place and id.
      return updateStop(state, action.dayId, action.stopId, (stop) => ({ ...action.stop, id: stop.id, done: false }))

    case 'TOGGLE_PACKED': {
      if (!state.info?.packing.includes(action.item)) return state
      const packed = state.packed.includes(action.item) ? state.packed.filter((i) => i !== action.item) : [...state.packed, action.item]
      return { ...state, packed }
    }

    case 'REMOVE_DAY': {
      const days = state.days.filter((d) => d.id !== action.dayId)
      return days.length === state.days.length ? state : { ...state, days }
    }
  }
}

function applyStreamEvent(state: Trip, event: PlanEvent): Trip {
  switch (event.type) {
    case 'meta':
      return { ...state, meta: event.meta }
    case 'day': {
      // Days carry their own index, so a resumed stream slots in after the existing ones.
      if (event.index < 0 || event.index >= LIMITS.days) return state
      const days = [...state.days]
      if (event.index < days.length) days[event.index] = toTripDay(event.day)
      else days.push(toTripDay(event.day))
      return { ...state, days }
    }
    case 'transport':
      return { ...state, transport: event.legs }
    case 'stays':
      return { ...state, stays: event.nights }
    case 'info':
      return { ...state, info: event.info }
    case 'warning':
      return { ...state, warnings: [...state.warnings, event.message].slice(-MAX_WARNINGS) }
    default:
      // retry / error / done describe the request, not the trip; the stream hook handles them.
      return state
  }
}

/** Applies `update` to one day; returns the same state if the day is missing or unchanged. */
function updateDay(state: Trip, dayId: string, update: (day: TripDay) => TripDay): Trip {
  let changed = false
  const days = state.days.map((day) => {
    if (day.id !== dayId) return day
    const next = update(day)
    if (next !== day) changed = true
    return next
  })
  return changed ? { ...state, days } : state
}

function updateStop(state: Trip, dayId: string, stopId: string, update: (stop: TripDay['stops'][number]) => TripDay['stops'][number]): Trip {
  return updateDay(state, dayId, (day) => {
    let changed = false
    const stops = day.stops.map((stop) => {
      if (stop.id !== stopId) return stop
      const next = update(stop)
      if (next !== stop) changed = true
      return next
    })
    return changed ? { ...day, stops } : day
  })
}
