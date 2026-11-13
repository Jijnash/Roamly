import { LIMITS } from '@/lib/limits'
import { cleanList, cleanNumber, cleanText, isObject, pick } from '@/lib/contracts/clean'
import {
  CATEGORIES,
  STAY_TIERS,
  TRANSPORT_MODES,
  type Category,
  type Day,
  type Plan,
  type PlanMeta,
  type StayNight,
  type StayTier,
  type Stop,
  type TransportLeg,
  type TransportMode,
  type TripInfo,
} from '@/lib/contracts/types'

/**
 * Plan contracts: turn untrusted AI output into the app's types.
 *
 * Rules, applied everywhere:
 *  - accept common variants (e.g. "activities" for "stops", "place" for "name")
 *  - clean and length-cap every string; range-check every number; whitelist enums
 *  - drop broken items with a warning instead of failing the whole plan
 *  - throw ModelOutputError only when nothing usable is left
 *
 * Used on the server for model output, and on the client to re-check saved trips.
 */

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelOutputError'
  }
}

export type Normalized<T> = { value: T; warnings: string[] }

// ---------- small field helpers ----------

/** "9:30 am", "09.30", "2pm", "14:00" → "HH:MM" (24-hour). Anything else → "". */
export function normalizeTime(value: unknown): string {
  const text = cleanText(value, 20).toLowerCase()
  const match = text.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/)
  if (!match || (!match[2] && !match[3])) return ''
  let hours = Number(match[1])
  const minutes = Number(match[2] ?? 0)
  if (match[3] === 'pm' && hours < 12) hours += 12
  if (match[3] === 'am' && hours === 12) hours = 0
  if (hours > 23 || minutes > 59) return ''
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const CATEGORY_WORDS: Record<Category, string[]> = {
  sight: ['sight', 'landmark', 'monument', 'museum', 'temple', 'church', 'fort', 'palace', 'attraction', 'viewpoint', 'heritage'],
  food: ['food', 'meal', 'restaurant', 'lunch', 'dinner', 'breakfast', 'cafe', 'eat', 'snack', 'street food'],
  activity: ['activity', 'experience', 'tour', 'beach', 'adventure', 'shopping', 'market', 'nightlife', 'walk', 'hike', 'trek'],
  transport: ['transport', 'travel', 'transfer', 'drive', 'train', 'flight', 'bus', 'cab', 'ferry', 'commute'],
  stay: ['stay', 'hotel', 'accommodation', 'check-in', 'check in', 'lodging', 'hostel'],
  other: [],
}

export function normalizeCategory(value: unknown): Category {
  const text = cleanText(value, 40).toLowerCase()
  if ((CATEGORIES as readonly string[]).includes(text)) return text as Category
  for (const category of CATEGORIES) {
    if (CATEGORY_WORDS[category].some((word) => text.includes(word))) return category
  }
  return 'other'
}

function normalizeMode(value: unknown): TransportMode {
  const text = cleanText(value, 40).toLowerCase()
  if ((TRANSPORT_MODES as readonly string[]).includes(text)) return text as TransportMode
  if (/rail|vande/.test(text)) return 'train'
  if (/plane|air|fly/.test(text)) return 'flight'
  if (/taxi|uber|ola|auto/.test(text)) return 'cab'
  if (/road|drive|self/.test(text)) return 'car'
  if (/boat/.test(text)) return 'ferry'
  return 'other'
}

function normalizeTier(value: unknown): StayTier {
  const text = cleanText(value, 40).toLowerCase()
  if ((STAY_TIERS as readonly string[]).includes(text)) return text as StayTier
  if (/cheap|hostel|budget|economy/.test(text)) return 'budget'
  if (/lux|premium|5|five|high/.test(text)) return 'premium'
  return 'mid'
}

function firstText(value: unknown, max: number): string {
  // Tips sometimes arrive as a list; keep the first one.
  return cleanText(Array.isArray(value) ? value[0] : value, max)
}

// ---------- per-part normalizers ----------

export function normalizeStop(raw: unknown): Stop | null {
  if (!isObject(raw)) return null
  const name = cleanText(pick(raw, ['name', 'place', 'title', 'location', 'activity']), LIMITS.nameChars)
  if (!name) return null
  const duration = pick(raw, ['duration', 'length', 'timeSpent'])
  return {
    name,
    time: normalizeTime(pick(raw, ['time', 'at', 'start', 'startTime'])),
    duration: typeof duration === 'number' ? `${Math.round(duration)} min` : cleanText(duration, LIMITS.shortChars),
    category: normalizeCategory(pick(raw, ['category', 'type', 'kind'])),
    description: cleanText(pick(raw, ['description', 'notes', 'details', 'desc', 'summary']), LIMITS.descriptionChars),
    tip: firstText(pick(raw, ['tip', 'tips', 'advice']), LIMITS.tipChars),
  }
}

export function normalizeDay(raw: unknown): Normalized<Day> {
  if (!isObject(raw)) throw new ModelOutputError('day is not an object')
  const rawStops = pick(raw, ['stops', 'activities', 'items', 'places', 'schedule'])
  if (!Array.isArray(rawStops)) throw new ModelOutputError('day has no list of stops')

  const title = cleanText(pick(raw, ['title', 'theme', 'name', 'heading']), LIMITS.titleChars)
  const label = title ? `"${title}"` : 'a day'
  const warnings: string[] = []

  let stops = rawStops.map(normalizeStop).filter((s): s is Stop => s !== null)
  const dropped = rawStops.length - stops.length
  if (dropped > 0) warnings.push(`Skipped ${dropped} unreadable stop${dropped > 1 ? 's' : ''} on ${label}.`)
  if (stops.length > LIMITS.stopsPerDay) {
    warnings.push(`Trimmed ${label} to ${LIMITS.stopsPerDay} stops.`)
    stops = stops.slice(0, LIMITS.stopsPerDay)
  }
  if (stops.length === 0) throw new ModelOutputError('day has no usable stops')

  return {
    value: {
      title,
      stayArea: cleanText(pick(raw, ['stayArea', 'stay_area', 'stay', 'area', 'base']), LIMITS.shortChars),
      stops,
    },
    warnings,
  }
}

export function normalizeMeta(raw: unknown): PlanMeta {
  const obj = isObject(raw) ? raw : {}
  return {
    title: cleanText(pick(obj, ['title', 'name', 'tripTitle']), LIMITS.titleChars) || 'Your trip',
    destination: cleanText(pick(obj, ['destination', 'place', 'location']), LIMITS.titleChars),
    summary: cleanText(pick(obj, ['summary', 'overview', 'description']), LIMITS.summaryChars),
    why: cleanList(pick(obj, ['why', 'reasons', 'rationale']), 5, LIMITS.listItemChars),
  }
}

export function normalizeTransport(raw: unknown): TransportLeg[] {
  const list = isObject(raw) ? pick(raw, ['legs', 'transport', 'options']) : raw
  if (!Array.isArray(list)) throw new ModelOutputError('transport has no legs')
  const legs = list
    .filter(isObject)
    .map((leg) => ({
      from: cleanText(pick(leg, ['from', 'origin', 'start']), LIMITS.shortChars),
      to: cleanText(pick(leg, ['to', 'destination', 'end']), LIMITS.shortChars),
      mode: normalizeMode(pick(leg, ['mode', 'type', 'by'])),
      reason: cleanText(pick(leg, ['reason', 'why', 'notes']), LIMITS.descriptionChars),
    }))
    .filter((leg) => leg.from && leg.to)
    .slice(0, 6)
  if (legs.length === 0) throw new ModelOutputError('transport has no usable legs')
  return legs
}

export function normalizeStays(raw: unknown, dayCount: number = LIMITS.days): StayNight[] {
  const list = isObject(raw) ? pick(raw, ['nights', 'stays', 'hotels']) : raw
  if (!Array.isArray(list)) throw new ModelOutputError('stays has no nights')
  const nights = list
    .filter(isObject)
    .map((night) => ({
      dayIndexes: (Array.isArray(night.dayIndexes) ? night.dayIndexes : [])
        .filter((i): i is number => Number.isInteger(i) && i >= 0 && i < dayCount)
        .slice(0, LIMITS.days),
      area: cleanText(pick(night, ['area', 'location', 'neighbourhood', 'neighborhood']), LIMITS.shortChars),
      options: (Array.isArray(night.options) ? night.options : [])
        .filter(isObject)
        .map((o) => ({
          name: cleanText(pick(o, ['name', 'hotel', 'title']), LIMITS.nameChars),
          tier: normalizeTier(pick(o, ['tier', 'level', 'category'])),
          why: cleanText(pick(o, ['why', 'reason', 'notes']), LIMITS.descriptionChars),
        }))
        .filter((o) => o.name)
        .slice(0, 3),
    }))
    .filter((night) => night.area || night.options.length > 0)
    .slice(0, LIMITS.days)
  if (nights.length === 0) throw new ModelOutputError('stays has no usable nights')
  return nights
}

export function normalizeInfo(raw: unknown): TripInfo {
  if (!isObject(raw)) throw new ModelOutputError('info is not an object')
  let budget: TripInfo['budget'] = null
  if (isObject(raw.budget)) {
    const b = raw.budget
    const breakdown = (Array.isArray(b.breakdown) ? b.breakdown : [])
      .filter(isObject)
      .map((item) => ({ label: cleanText(item.label, LIMITS.shortChars), amount: cleanNumber(item.amount, LIMITS.budgetMax) }))
      .filter((item): item is { label: string; amount: number } => item.label !== '' && item.amount !== null)
      .slice(0, LIMITS.listItems)
    const perPerson = cleanNumber(pick(b, ['perPerson', 'per_person', 'total']), LIMITS.budgetMax)
    if (perPerson !== null || breakdown.length > 0) {
      const currency = cleanText(b.currency, 5).toUpperCase()
      budget = {
        currency: /^[A-Z]{3}$/.test(currency) ? currency : 'INR',
        perPerson: perPerson ?? breakdown.reduce((sum, item) => sum + item.amount, 0),
        breakdown,
      }
    }
  }
  const info: TripInfo = {
    budget,
    packing: cleanList(raw.packing, LIMITS.listItems, LIMITS.listItemChars),
    tips: cleanList(raw.tips, LIMITS.listItems, LIMITS.listItemChars),
    safety: cleanList(raw.safety, LIMITS.listItems, LIMITS.listItemChars),
    phrases: cleanList(raw.phrases, LIMITS.listItems, LIMITS.listItemChars),
  }
  const empty = !info.budget && [info.packing, info.tips, info.safety, info.phrases].every((l) => l.length === 0)
  if (empty) throw new ModelOutputError('info is empty')
  return info
}

// ---------- whole objects from the stream ----------

/** One validated piece of a plan, before the stream assigns day indexes. */
export type PlanPart =
  | { type: 'meta'; meta: PlanMeta }
  | { type: 'day'; day: Day }
  | { type: 'transport'; legs: TransportLeg[] }
  | { type: 'stays'; nights: StayNight[] }
  | { type: 'info'; info: TripInfo }

const DAY_LIST_KEYS = ['days', 'itinerary', 'plan', 'schedule'] as const

/** Works out what an object is: from its "type" field, or by looking at its keys when "type" is missing. */
function classify(obj: Record<string, unknown>): string {
  const type = typeof obj.type === 'string' ? obj.type.toLowerCase() : ''
  if (['meta', 'day', 'transport', 'stays', 'info'].includes(type)) return type
  if (DAY_LIST_KEYS.some((k) => Array.isArray(obj[k]))) return 'plan'
  if (['stops', 'activities', 'items', 'places'].some((k) => Array.isArray(obj[k]))) return 'day'
  if (Array.isArray(obj.legs)) return 'transport'
  if (Array.isArray(obj.nights)) return 'stays'
  if (obj.budget || obj.packing || obj.tips) return 'info'
  if (obj.title || obj.summary || obj.destination) return 'meta'
  return 'unknown'
}

/**
 * Turns one parsed object into plan parts. Handles both the NDJSON events we ask
 * for and a whole plan in one object (some models ignore the line format).
 * Never throws: unusable pieces become warnings.
 */
export function toPlanParts(raw: unknown): { parts: PlanPart[]; warnings: string[] } {
  if (!isObject(raw)) return { parts: [], warnings: ['Skipped a part of the plan that was not an object.'] }
  const kind = classify(raw)
  const warnings: string[] = []

  try {
    switch (kind) {
      case 'meta':
        return { parts: [{ type: 'meta', meta: normalizeMeta(raw) }], warnings }
      case 'day': {
        const { value, warnings: w } = normalizeDay(raw)
        return { parts: [{ type: 'day', day: value }], warnings: w }
      }
      case 'transport':
        return { parts: [{ type: 'transport', legs: normalizeTransport(raw) }], warnings }
      case 'stays':
        return { parts: [{ type: 'stays', nights: normalizeStays(raw) }], warnings }
      case 'info':
        return { parts: [{ type: 'info', info: normalizeInfo(raw) }], warnings }
      case 'plan':
        return planToParts(raw)
      default:
        return { parts: [], warnings: ['Skipped a part of the plan in an unknown format.'] }
    }
  } catch (err) {
    if (!(err instanceof ModelOutputError)) throw err
    const what = kind === 'day' ? 'a day' : `the ${kind} section`
    return { parts: [], warnings: [`Skipped ${what} because it could not be read.`] }
  }
}

/** A whole-plan object ({ title, days: [...], ... } or { itinerary: [...] }) → parts. */
function planToParts(raw: Record<string, unknown>): { parts: PlanPart[]; warnings: string[] } {
  const parts: PlanPart[] = [{ type: 'meta', meta: normalizeMeta(isObject(raw.meta) ? raw.meta : raw) }]
  const warnings: string[] = []
  const found = pick(raw, DAY_LIST_KEYS)
  const list = Array.isArray(found) ? found : []

  for (const rawDay of list) {
    try {
      const { value, warnings: w } = normalizeDay(rawDay)
      parts.push({ type: 'day', day: value })
      warnings.push(...w)
    } catch (err) {
      if (!(err instanceof ModelOutputError)) throw err
      warnings.push('Skipped a day because it could not be read.')
    }
  }

  // Optional sections, either nested under their own key or at the top level.
  const optional: [string, () => PlanPart][] = [
    ['transport', () => ({ type: 'transport', legs: normalizeTransport(raw.transport) })],
    ['stays', () => ({ type: 'stays', nights: normalizeStays(raw.stays) })],
    ['info', () => ({ type: 'info', info: normalizeInfo(isObject(raw.info) ? raw.info : raw) })],
  ]
  for (const [key, build] of optional) {
    if (key !== 'info' && raw[key] === undefined) continue
    try {
      parts.push(build())
    } catch (err) {
      if (!(err instanceof ModelOutputError)) throw err
      // A missing info block is normal for a partial plan; only warn about sections that were present.
      if (raw[key] !== undefined) warnings.push(`Skipped the ${key} section because it could not be read.`)
    }
  }
  return { parts, warnings }
}

/**
 * Validates a whole plan object (refine output, a plan sent by the client, a saved trip).
 * Throws ModelOutputError if there are no usable days.
 */
export function normalizePlan(raw: unknown): Normalized<Plan> {
  const { parts, warnings } = isObject(raw) ? planToParts({ ...raw, days: pick(raw, DAY_LIST_KEYS) ?? [] }) : { parts: [], warnings: [] }
  const plan: Plan = { meta: normalizeMeta({}), days: [], transport: [], stays: [], info: null }
  for (const part of parts) {
    if (part.type === 'meta') plan.meta = part.meta
    else if (part.type === 'day') plan.days.push(part.day)
    else if (part.type === 'transport') plan.transport = part.legs
    else if (part.type === 'stays') plan.stays = part.nights
    else if (part.type === 'info') plan.info = part.info
  }
  if (plan.days.length === 0) throw new ModelOutputError('plan has no usable days')
  if (plan.days.length > LIMITS.days) {
    warnings.push(`Trimmed the plan to ${LIMITS.days} days.`)
    plan.days = plan.days.slice(0, LIMITS.days)
  }
  return { value: plan, warnings }
}

/** Swap suggestions: { alternatives: [stop, …] } → 1–3 valid stops that differ from `currentName`. */
export function normalizeAlternatives(raw: unknown, currentName: string): Normalized<Stop[]> {
  const list = isObject(raw) ? pick(raw, ['alternatives', 'options', 'stops', 'suggestions']) : raw
  if (!Array.isArray(list)) throw new ModelOutputError('no list of alternatives')
  const seen = new Set([currentName.toLowerCase()])
  const stops: Stop[] = []
  for (const item of list) {
    const stop = normalizeStop(item)
    if (!stop || seen.has(stop.name.toLowerCase())) continue
    seen.add(stop.name.toLowerCase())
    stops.push(stop)
    if (stops.length === 3) break
  }
  if (stops.length === 0) throw new ModelOutputError('no usable alternatives')
  return { value: stops, warnings: stops.length < 3 ? [`Only ${stops.length} usable suggestion${stops.length > 1 ? 's' : ''} came back.`] : [] }
}
