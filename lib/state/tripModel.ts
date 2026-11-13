import type { Day, Plan, PlanMeta, Stop, StayNight, TransportLeg, TripInfo } from '@/lib/contracts/types'

/**
 * The trip as the browser holds it. Same data as a Plan, plus:
 *  - ids on days and stops, so edits target a specific item (not an index that may have moved)
 *  - per-stop `done` flags, and the warnings collected while generating
 */

export type TripStop = Stop & { id: string; done: boolean }
export type TripDay = Omit<Day, 'stops'> & { id: string; stops: TripStop[] }

/** What the user asked for; kept so "Continue" and "Retry" can resend it. */
export type TripInput = {
  text: string
  style?: string
  pace?: string
  interests: string[]
  answers: Record<string, string>
}

/** Bump when the saved shape changes, and add a migration in lib/storage/tripSchema.ts. */
export const TRIP_SCHEMA_VERSION = 1

export type Trip = {
  schemaVersion: number
  id: string
  createdAt: number
  updatedAt: number
  input: TripInput
  meta: PlanMeta
  days: TripDay[]
  transport: TransportLeg[]
  stays: StayNight[]
  info: TripInfo | null
  warnings: string[]
  /** Packing-list items the user has ticked off. */
  packed: string[]
}

/** e.g. "stop_3f9a0c2b1e". crypto.randomUUID exists in browsers and Node 20+. */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 10)}`
}

export function toTripStop(stop: Stop): TripStop {
  return { ...stop, id: newId('stop'), done: false }
}

export function toTripDay(day: Day): TripDay {
  return { ...day, id: newId('day'), stops: day.stops.map(toTripStop) }
}

export function emptyTrip(input: TripInput, now = Date.now()): Trip {
  return {
    schemaVersion: TRIP_SCHEMA_VERSION,
    id: newId('trip'),
    createdAt: now,
    updatedAt: now,
    input,
    meta: { title: '', destination: '', summary: '', why: [] },
    days: [],
    transport: [],
    stays: [],
    info: null,
    warnings: [],
    packed: [],
  }
}

/** Trip → plain Plan (no ids or done flags), e.g. to send to /api/refine. */
export function toPlan(trip: Trip): Plan {
  return {
    meta: trip.meta,
    days: trip.days.map(({ title, stayArea, stops }) => ({
      title,
      stayArea,
      stops: stops.map(({ id: _id, done: _done, ...stop }) => stop),
    })),
    transport: trip.transport,
    stays: trip.stays,
    info: trip.info,
  }
}

/** Small summary of the trip sent with one-day and one-stop AI edits, so the model avoids repeats. */
export function tripContext(trip: Trip) {
  return {
    destination: trip.meta.destination,
    title: trip.meta.title,
    style: trip.input.style,
    pace: trip.input.pace,
    days: trip.days.map((d) => ({ title: d.title, stops: d.stops.map((s) => s.name) })),
  }
}
