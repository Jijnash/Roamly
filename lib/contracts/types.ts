import type { ErrorBody } from '@/lib/errors'

/**
 * The shapes the rest of the app relies on. The AI's raw output is never trusted
 * directly: lib/contracts/plan.ts turns whatever came back into these types.
 */

export const CATEGORIES = ['sight', 'food', 'activity', 'transport', 'stay', 'other'] as const
export type Category = (typeof CATEGORIES)[number]

export type Stop = {
  name: string
  /** "HH:MM" (24-hour) or "" when the model gave no usable time. */
  time: string
  duration: string
  category: Category
  description: string
  tip: string
}

export type Day = {
  title: string
  stayArea: string
  stops: Stop[]
}

export type PlanMeta = {
  title: string
  destination: string
  summary: string
  /** Short reasons behind the plan ("Why this plan"). */
  why: string[]
}

export const TRANSPORT_MODES = ['train', 'flight', 'bus', 'car', 'cab', 'ferry', 'other'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

export type TransportLeg = { from: string; to: string; mode: TransportMode; reason: string }

export const STAY_TIERS = ['budget', 'mid', 'premium'] as const
export type StayTier = (typeof STAY_TIERS)[number]

export type StayNight = {
  /** 0-based indexes of the days this stay covers. */
  dayIndexes: number[]
  area: string
  options: { name: string; tier: StayTier; why: string }[]
}

export type TripInfo = {
  budget: { currency: string; perPerson: number; breakdown: { label: string; amount: number }[] } | null
  packing: string[]
  tips: string[]
  safety: string[]
  phrases: string[]
}

/** A whole plan, as returned by /api/refine and kept in the client's trip state. */
export type Plan = {
  meta: PlanMeta
  days: Day[]
  transport: TransportLeg[]
  stays: StayNight[]
  info: TripInfo | null
}

/**
 * Events streamed from /api/plan to the browser, one JSON object per line (NDJSON).
 * Everything except `error` and `done` can arrive in any order; `day` carries its index.
 */
export type PlanEvent =
  | { type: 'meta'; meta: PlanMeta }
  | { type: 'day'; index: number; day: Day }
  | { type: 'transport'; legs: TransportLeg[] }
  | { type: 'stays'; nights: StayNight[] }
  | { type: 'info'; info: TripInfo }
  | { type: 'warning'; message: string }
  | { type: 'retry'; reason: string }
  | { type: 'error'; error: ErrorBody['error'] }
  | { type: 'done'; complete: boolean; dayCount: number; warningCount: number; provider: string | null }
