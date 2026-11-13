import 'server-only'
import { AppError } from '@/lib/errors'
import { CHAOS_TRIGGERS, type ChaosTrigger } from '@/lib/chaos'
import type { ModelRequest, Provider } from '@/lib/server/ai/types'
import { ALTERNATIVE_STOPS, EXTRA_DAYS, SAMPLE_DAYS, buildMockPlanNdjson, buildMockPlanObject } from '@/lib/server/ai/providers/mockTrip'

/**
 * Mock provider: no network, no key. Used automatically when no AI keys are set.
 *
 * Put a trigger in the trip text to reproduce each failure on demand
 * (docs/RELIABILITY.md lists them all):
 *   [malformed]   chatter, a code fence, a trailing comma and one cut-off day line
 *   [garbage]     prose with no JSON; the server's strict retry then succeeds
 *   [wrong-shape] one big object with unexpected key names
 *   [empty]       returns nothing (also on the retry)
 *   [slow]        silent for 9.5 s, then one line a second: shows the "taking longer" notice (8 s) and Cancel
 *   [fail]        provider error
 *   [ratelimit]   provider rate limit
 *   [cutoff]      stream stops in the middle of day 2
 */

export function findTrigger(text: string): ChaosTrigger | null {
  const lower = text.toLowerCase()
  return CHAOS_TRIGGERS.find((t) => lower.includes(`[${t}]`)) ?? null
}

/** "5 days in Goa" → 5. Defaults to 3 when no day count is found. */
export function daysFromText(text: string): number {
  const match = text.match(/(\d{1,2})\s*-?\s*(day|days|night|nights)\b/i)
  return match ? Number(match[1]) : 3
}

/** Waits `ms`, but rejects straight away if the request is aborted. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

/** Splits text into fixed-size pieces, like tokens arriving from a real model. */
function toChunks(text: string, size = 48): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

function malformedOutput(days: number): string {
  const [meta, firstDay, secondDay, ...rest] = buildMockPlanNdjson(Math.max(days, 3)).split('\n')
  // Day 2 is cut off inside its title string, as when a model's output is truncated mid-line.
  const cut = secondDay.slice(0, secondDay.indexOf('"title":"') + 12)
  return [
    "Sure! Here's your plan:",
    '```json',
    meta.replace(/}$/, ',}'), // trailing comma: fixed by the lenient parser
    firstDay,
    cut,
    ...rest,
    '```',
  ].join('\n')
}

function wrongShapeOutput(): string {
  // A plausible but different shape: one object, "itinerary" instead of day lines, "place" instead of "name".
  return JSON.stringify({
    itinerary: [
      { day: 1, theme: 'Old Goa', activities: [{ place: 'Basilica of Bom Jesus', at: '9:00 am', notes: '16th-century church.' }] },
      { day: 2, theme: 'Beaches', activities: [{ place: 'Candolim Beach', at: '11:00', notes: 'Calm beach for a swim.' }] },
    ],
  }, null, 2)
}

function cutoffOutput(days: number): string {
  const lines = buildMockPlanNdjson(Math.max(days, 2)).split('\n')
  return [lines[0], lines[1], lines[2].slice(0, Math.floor(lines[2].length / 2))].join('\n')
}

function refineOutput(user: string): string {
  // The mock can't really follow an instruction; it makes one visible change so the refine
  // flow can be demoed: the last stop of each day is removed and the summary says so.
  const plan = buildMockPlanObject(daysFromText(user))
  plan.summary = 'Mock refine: removed the last stop of each day. Add an API key for real edits.'
  plan.days = plan.days.map((day) => ({ ...day, stops: day.stops.slice(0, Math.max(day.stops.length - 1, 1)) }))
  return JSON.stringify(plan)
}

/** Intake: pick obvious facts out of the text, then ask about what's missing (max 4 questions). */
function intakeOutput(user: string): string {
  const text = user.replace(/<\/?trip_request>/g, '')
  const known: Record<string, string> = {}
  const place = text.match(/\b(?:in|to|around)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/)
  if (place) known.destination = place[1]
  const days = text.match(/(\d{1,2})\s*-?\s*(?:day|days|night|nights)\b/i)
  if (days) known.days = days[1]
  const who = text.match(/\b(solo|alone|couple|partner|friends|family|kids)\b/i)
  if (who) known.travellers = who[1].toLowerCase()
  const budget = text.match(/(?:₹|rs\.?\s?|inr\s?)\s?(\d[\d,]*k?)/i)
  if (budget) known.budget = `₹${budget[1]}`
  const from = text.match(/\bfrom\s+([A-Z][a-zA-Z]+)/)
  if (from) known.origin = from[1]

  const all = [
    { id: 'origin', label: 'Where are you starting from?', type: 'text' },
    { id: 'days', label: 'How many days?', type: 'number', default: '3' },
    { id: 'travellers', label: "Who's going?", type: 'chips', options: ['Solo', 'Couple', 'Friends', 'Family with kids'] },
    { id: 'budget', label: 'Budget per person', type: 'chips', options: ['Under ₹15k', '₹15k–40k', '₹40k+'] },
    { id: 'food', label: 'Food preferences', type: 'multi', options: ['Veg', 'Non-veg', 'Jain'] },
  ]
  return JSON.stringify({ known, questions: all.filter((q) => !(q.id in known)).slice(0, 4) })
}

/** Rewrite one day: the first canned day whose title isn't already in the trip. */
function dayOutput(user: string): string {
  const day = [...EXTRA_DAYS, ...SAMPLE_DAYS].find((d) => !user.includes(d.title)) ?? EXTRA_DAYS[0]
  return JSON.stringify(day)
}

/** Three replacement stops that aren't already in the trip. */
function alternativesOutput(user: string): string {
  return JSON.stringify({ alternatives: ALTERNATIVE_STOPS.filter((s) => !user.includes(s.name)).slice(0, 3) })
}

/**
 * `delayScale` multiplies every wait: 1 for the app, 0 in tests so they run instantly.
 */
export function createMockProvider({ delayScale = 1 } = {}): Provider {
  return {
    name: 'mock',
    async *stream(req: ModelRequest) {
      const trigger = findTrigger(req.user)
      const days = daysFromText(req.user)
      const wait = (ms: number) => sleep(ms * delayScale, req.signal)

      if (trigger === 'fail') throw new AppError('UPSTREAM_ERROR', 'Mock provider failure ([fail] trigger).')
      if (trigger === 'ratelimit') throw new AppError('RATE_LIMITED', undefined, { retryAfterSec: 20 })
      if (trigger === 'empty') return

      let text: string
      if (trigger === 'garbage' && !req.strict) text = 'Goa is lovely in December! Start in Old Goa, then hit the beaches. Enjoy!'
      else if (trigger === 'malformed') text = malformedOutput(days)
      else if (trigger === 'wrong-shape') text = wrongShapeOutput()
      else if (trigger === 'cutoff') text = cutoffOutput(days)
      else if (req.task === 'intake') text = intakeOutput(req.user)
      else if (req.task === 'day') text = dayOutput(req.user)
      else if (req.task === 'alternatives') text = alternativesOutput(req.user)
      else if (req.json) text = refineOutput(req.user)
      else text = buildMockPlanNdjson(days)

      if (trigger === 'slow') {
        // Silent for longer than the browser's 8 s "taking longer" threshold, then one line a second.
        await wait(9500)
        for (const line of text.split('\n')) {
          yield line + '\n'
          await wait(1000)
        }
        return
      }

      for (const chunk of toChunks(text)) {
        await wait(15)
        yield chunk
      }
    },
  }
}

export const mockProvider = createMockProvider()
