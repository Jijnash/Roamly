import { LIMITS } from '@/lib/limits'
import { cleanList, cleanText, isObject } from '@/lib/contracts/clean'
import { ModelOutputError, normalizeInfo, normalizeMeta, normalizeStays, normalizeStop, normalizeTransport } from '@/lib/contracts/plan'
import { newId, TRIP_SCHEMA_VERSION, type Trip, type TripDay, type TripStop } from '@/lib/state/tripModel'

/**
 * Turns a saved record back into a Trip, or throws CorruptTripError.
 *
 * Saved data is untrusted too: it may come from an older version of the app,
 * a browser extension, or a half-written save. So it goes through the same
 * validators as AI output, plus a migration step for older schema versions.
 */

export class CorruptTripError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CorruptTripError'
  }
}

/**
 * Migrations, keyed by the version they upgrade FROM. Each takes the raw record
 * of that version and returns the next version's shape. Empty for now (v1 is the
 * first saved format); the loop below already handles future ones.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {}

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1
  if (version > TRIP_SCHEMA_VERSION) throw new CorruptTripError(`saved by a newer version of Roamly (v${version})`)
  let record = raw
  while (version < TRIP_SCHEMA_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) throw new CorruptTripError(`no migration from v${version}`)
    record = step(record)
    version++
  }
  return record
}

const ID = /^[a-z]+_[a-z0-9]{4,20}$/i
const validId = (value: unknown, prefix: string) => (typeof value === 'string' && ID.test(value) ? value : newId(prefix))
const time = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : Date.now())

/** Runs a section validator, turning "unusable" into a fallback instead of failing the whole trip. */
function optional<T>(fn: () => T, fallback: T): T {
  try {
    return fn()
  } catch (err) {
    if (err instanceof ModelOutputError) return fallback
    throw err
  }
}

export function parseStoredTrip(value: unknown): Trip {
  if (!isObject(value)) throw new CorruptTripError('not an object')
  const raw = migrate(value)
  if (typeof raw.id !== 'string' || !ID.test(raw.id)) throw new CorruptTripError('missing id')
  if (!Array.isArray(raw.days)) throw new CorruptTripError('missing days')
  const input = isObject(raw.input) ? raw.input : null
  if (!input || typeof input.text !== 'string') throw new CorruptTripError('missing input')

  const days: TripDay[] = raw.days.filter(isObject).slice(0, LIMITS.days).map((day) => ({
    id: validId(day.id, 'day'),
    title: cleanText(day.title, LIMITS.titleChars),
    stayArea: cleanText(day.stayArea, LIMITS.shortChars),
    stops: (Array.isArray(day.stops) ? day.stops : [])
      .slice(0, LIMITS.stopsPerDay * 2) // users may add stops beyond the AI limit by moving them between days
      .map((rawStop): TripStop | null => {
        const stop = normalizeStop(rawStop)
        if (!stop || !isObject(rawStop)) return null
        return { ...stop, id: validId(rawStop.id, 'stop'), done: rawStop.done === true }
      })
      .filter((s): s is TripStop => s !== null),
  }))
  if (days.length === 0) throw new CorruptTripError('no days')

  const answers: Record<string, string> = {}
  if (isObject(input.answers)) {
    for (const [k, v] of Object.entries(input.answers).slice(0, 12)) {
      const text = cleanText(v, 120)
      if (text) answers[cleanText(k, 30)] = text
    }
  }

  return {
    schemaVersion: TRIP_SCHEMA_VERSION,
    id: raw.id,
    createdAt: time(raw.createdAt),
    updatedAt: time(raw.updatedAt),
    input: {
      text: input.text.slice(0, LIMITS.inputChars),
      style: cleanText(input.style, 20) || undefined,
      pace: cleanText(input.pace, 20) || undefined,
      interests: cleanList(input.interests, 10, 30),
      answers,
    },
    meta: normalizeMeta(raw.meta),
    days,
    transport: optional(() => normalizeTransport(raw.transport), []),
    stays: optional(() => normalizeStays(raw.stays, days.length), []),
    info: raw.info == null ? null : optional(() => normalizeInfo(raw.info), null),
    warnings: cleanList(raw.warnings, 20, 200),
    packed: cleanList(raw.packed, LIMITS.listItems, LIMITS.listItemChars),
  }
}
