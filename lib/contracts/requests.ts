import { AppError } from '@/lib/errors'
import { LIMITS } from '@/lib/limits'
import { cleanList, cleanText, isObject } from '@/lib/contracts/clean'
import { isChaosTrigger, type ChaosTrigger } from '@/lib/chaos'

/**
 * Validates request bodies sent to our API. Only known fields are kept
 * (anything else is dropped), and every string is length-capped.
 */

export const STYLES = ['tourist', 'local', 'explorer', 'relaxed', 'family', 'backpacker', 'luxury', 'rail', 'road'] as const
export const PACES = ['relaxed', 'balanced', 'packed'] as const

export type PlanRequest = {
  text: string
  style?: (typeof STYLES)[number]
  pace?: (typeof PACES)[number]
  interests: string[]
  /** Answers to intake questions, e.g. { origin: "Hyderabad", budget: "40000" }. */
  answers: Record<string, string>
  /** Set by "Continue" after a cut-off: generate from day `fromDay` (0-based) onwards. */
  resume?: { fromDay: number; previousTitles: string[] }
  /** Reliability lab: force this one request through the mock provider with a failure trigger. */
  chaos?: ChaosTrigger
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value.toLowerCase())
    ? (value.toLowerCase() as T)
    : undefined
}

function cleanAnswers(value: unknown): Record<string, string> {
  if (!isObject(value)) return {}
  const answers: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value).slice(0, 12)) {
    const k = cleanText(key, 30)
    const v = Array.isArray(raw) ? cleanList(raw, 8, 40).join(', ') : cleanText(raw, 120)
    if (k && v) answers[k] = v
  }
  return answers
}

export function parsePlanRequest(body: unknown): PlanRequest {
  if (!isObject(body)) throw new AppError('INVALID_INPUT', 'Send a JSON object with a "text" field.')
  if (typeof body.text !== 'string' || body.text.trim() === '') {
    throw new AppError('INVALID_INPUT', 'Describe your trip first.')
  }
  if (body.text.length > LIMITS.inputChars) {
    throw new AppError('INVALID_INPUT', `Keep the trip description under ${LIMITS.inputChars} characters.`)
  }

  const request: PlanRequest = {
    // The trip text keeps its line breaks trimmed but is otherwise the user's own words.
    text: body.text.trim(),
    style: oneOf(body.style, STYLES),
    pace: oneOf(body.pace, PACES),
    interests: cleanList(body.interests, 10, 30),
    answers: cleanAnswers(body.answers),
  }

  if (isChaosTrigger(body.chaos)) request.chaos = body.chaos

  if (isObject(body.resume)) {
    const fromDay = Number(body.resume.fromDay)
    if (Number.isInteger(fromDay) && fromDay > 0 && fromDay < LIMITS.days) {
      request.resume = { fromDay, previousTitles: cleanList(body.resume.previousTitles, LIMITS.days, LIMITS.titleChars) }
    }
  }
  return request
}

export type RefineRequest = { plan: unknown; instruction: string }

/** The plan itself is validated by normalizePlan (lib/contracts/plan.ts) in the route. */
export function parseRefineRequest(body: unknown): RefineRequest {
  if (!isObject(body) || !isObject(body.plan)) throw new AppError('INVALID_INPUT', 'Send the current plan and an instruction.')
  const instruction = cleanText(body.instruction, LIMITS.instructionChars)
  if (!instruction) throw new AppError('INVALID_INPUT', 'Say what you would like to change.')
  return { plan: body.plan, instruction }
}

/** Reads a JSON body with a size cap, turning bad JSON into INVALID_INPUT instead of a 500. */
export async function readJsonBody(req: Request): Promise<unknown> {
  const text = await req.text()
  if (text.length > LIMITS.bodyBytes) throw new AppError('INVALID_INPUT', 'The request is too large.')
  try {
    return JSON.parse(text)
  } catch {
    throw new AppError('INVALID_INPUT', 'The request body is not valid JSON.')
  }
}

/** Compact trip context sent with single-day and single-stop edits. */
export type TripContextInput = { destination: string; title: string; style?: string; pace?: string; days: { title: string; stops: string[] }[] }

function parseContext(value: unknown): TripContextInput {
  if (!isObject(value) || !Array.isArray(value.days)) throw new AppError('INVALID_INPUT', 'Send the trip context.')
  return {
    destination: cleanText(value.destination, LIMITS.titleChars),
    title: cleanText(value.title, LIMITS.titleChars),
    style: oneOf(value.style, STYLES),
    pace: oneOf(value.pace, PACES),
    days: value.days.filter(isObject).slice(0, LIMITS.days).map((d) => ({
      title: cleanText(d.title, LIMITS.titleChars),
      stops: cleanList(d.stops, LIMITS.stopsPerDay * 2, LIMITS.nameChars),
    })),
  }
}

function parseDayIndex(value: unknown, context: TripContextInput): number {
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0 || index >= Math.max(context.days.length, 1)) throw new AppError('INVALID_INPUT', 'Unknown day.')
  return index
}

/** POST /api/day body. The day itself is validated with normalizeDay in the route. */
export function parseDayRequest(body: unknown): { context: TripContextInput; dayIndex: number; day: unknown; note?: string } {
  if (!isObject(body)) throw new AppError('INVALID_INPUT', 'Send a JSON object.')
  const context = parseContext(body.context)
  const note = cleanText(body.note, LIMITS.instructionChars)
  return { context, dayIndex: parseDayIndex(body.dayIndex, context), day: body.day, ...(note && { note }) }
}

/** POST /api/alternatives body. The stop is validated with normalizeStop in the route. */
export function parseAlternativesRequest(body: unknown): { context: TripContextInput; dayIndex: number; stop: unknown } {
  if (!isObject(body)) throw new AppError('INVALID_INPUT', 'Send a JSON object.')
  const context = parseContext(body.context)
  return { context, dayIndex: parseDayIndex(body.dayIndex, context), stop: body.stop }
}
