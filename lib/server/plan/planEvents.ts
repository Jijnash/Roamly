import 'server-only'
import { AppError } from '@/lib/errors'
import { LIMITS } from '@/lib/limits'
import { createJsonScanner, parseLenient } from '@/lib/jsonScanner'
import { normalizeMeta, toPlanParts } from '@/lib/contracts/plan'
import type { PlanRequest } from '@/lib/contracts/requests'
import type { PlanEvent } from '@/lib/contracts/types'
import { PLAN_SYSTEM, STRICT_REMINDER, buildPlanUserPrompt } from '@/lib/server/ai/prompts'
import { streamModel, type StreamOptions } from '@/lib/server/ai/router'

/**
 * The plan pipeline: model text → scanner → lenient parse → validators → events.
 *
 *   1. Stream text from the model (router handles fallback and timeouts).
 *   2. The scanner pulls out each complete JSON object as soon as it closes,
 *      so each day reaches the browser while later days are still generating.
 *   3. Each object is parsed and validated on its own. A bad object becomes a
 *      `warning` event; it never stops the rest of the plan.
 *   4. If an attempt produced no usable day, retry once with a stricter prompt
 *      (a `retry` event tells the UI). If that also fails, throw a typed error.
 *   5. If the stream stopped mid-object after some days, finish with
 *      complete: false so the UI can offer "Continue".
 */

const MAX_WARNINGS = 10

export async function* planEvents(
  request: PlanRequest,
  signal: AbortSignal,
  options: StreamOptions = {},
): AsyncGenerator<PlanEvent> {
  let provider: string | null = null
  let dayIndex = request.resume?.fromDay ?? 0
  let sentMeta = Boolean(request.resume) // a resumed plan already has its meta
  let warningCount = 0
  const user = buildPlanUserPrompt(request)

  // Collects warning events, capped so a badly broken answer can't flood the UI.
  const warn = (message: string): PlanEvent[] => {
    warningCount++
    return warningCount <= MAX_WARNINGS ? [{ type: 'warning', message }] : []
  }

  /** One complete JSON object's text → the events to send. */
  const eventsFor = (text: string): PlanEvent[] => {
    const parsed = parseLenient(text)
    if (parsed === undefined) return warn('Skipped part of the plan because it was not valid JSON.')

    const { parts, warnings } = toPlanParts(parsed)
    const events: PlanEvent[] = warnings.flatMap(warn)
    for (const part of parts) {
      if (part.type === 'day') {
        if (dayIndex >= LIMITS.days) {
          events.push(...warn(`Stopped at ${LIMITS.days} days, the most Roamly plans at once.`))
          continue
        }
        events.push({ type: 'day', index: dayIndex++, day: part.day })
      } else if (part.type === 'meta') {
        if (request.resume) continue
        sentMeta = true
        events.push(part)
      } else {
        events.push(part)
      }
    }
    return events
  }

  for (const strict of [false, true]) {
    const scanner = createJsonScanner()
    const daysBefore = dayIndex
    let sawText = false

    const chunks = streamModel(
      { system: PLAN_SYSTEM + (strict ? STRICT_REMINDER : ''), user, tier: 'strong', signal, strict },
      { ...options, onProvider: (name) => (provider = name) },
    )
    for await (const chunk of chunks) {
      if (chunk.trim()) sawText = true
      const { objects, broken } = scanner.push(chunk)
      for (let i = 0; i < broken; i++) yield* warn('Skipped a line of the plan that was cut off.')
      for (const text of objects) yield* eventsFor(text)
    }
    const { partial } = scanner.flush()
    const newDays = dayIndex - daysBefore

    if (newDays > 0) {
      if (!sentMeta) yield { type: 'meta', meta: normalizeMeta({}) }
      const complete = partial === null
      if (!complete) yield* warn(`The plan was cut off after day ${dayIndex}. Use Continue to finish it.`)
      yield { type: 'done', complete, dayCount: dayIndex, warningCount, provider }
      return
    }

    if (strict) throw new AppError(sawText ? 'BAD_MODEL_OUTPUT' : 'EMPTY_OUTPUT')
    yield {
      type: 'retry',
      reason: sawText ? "The AI's answer could not be read. Trying once more…" : 'The AI returned an empty answer. Trying once more…',
    }
  }
}
