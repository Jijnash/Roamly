import 'server-only'
import { AppError } from '@/lib/errors'
import { createJsonScanner, parseLenient } from '@/lib/jsonScanner'
import { ModelOutputError, normalizeAlternatives, normalizeDay, normalizePlan, type Normalized } from '@/lib/contracts/plan'
import type { Day, Plan, Stop } from '@/lib/contracts/types'
import { normalizeIntake, type Intake } from '@/lib/contracts/intake'
import {
  ALTERNATIVES_SYSTEM,
  DAY_SYSTEM,
  INTAKE_SYSTEM,
  JSON_STRICT_REMINDER,
  REFINE_SYSTEM,
  buildAlternativesUserPrompt,
  buildDayUserPrompt,
  buildIntakeUserPrompt,
  buildRefineUserPrompt,
  type TripContext,
} from '@/lib/server/ai/prompts'
import type { ModelRequest, ModelTier } from '@/lib/server/ai/types'
import { completeModel, type StreamOptions } from '@/lib/server/ai/router'

/**
 * AI calls that return one JSON object (not a stream): intake questions, refine
 * the whole plan, rewrite one day, suggest replacements for one stop.
 *
 * All of them share the same safety net in completeValidated():
 *   ask → take the first object in the answer that passes its validator →
 *   if none does, retry once with a stricter prompt → otherwise a typed error.
 */

type Result<T> = { value: T; warnings: string[]; provider: string | null }

async function completeValidated<T>(
  req: { system: string; user: string; tier: ModelTier; task: NonNullable<ModelRequest['task']>; signal: AbortSignal },
  normalize: (raw: unknown) => Normalized<T>,
  options: StreamOptions,
): Promise<Result<T>> {
  let provider: string | null = null
  let sawText = false

  for (const strict of [false, true]) {
    const text = await completeModel(
      { ...req, system: req.system + (strict ? JSON_STRICT_REMINDER : ''), json: true, strict },
      { ...options, onProvider: (name) => (provider = name) },
    )
    if (text.trim()) sawText = true

    for (const objectText of createJsonScanner().push(text).objects) {
      try {
        const { value, warnings } = normalize(parseLenient(objectText))
        return { value, warnings, provider }
      } catch (err) {
        if (!(err instanceof ModelOutputError)) throw err
      }
    }
  }
  throw new AppError(sawText ? 'BAD_MODEL_OUTPUT' : 'EMPTY_OUTPUT')
}

export function refinePlan(plan: Plan, instruction: string, signal: AbortSignal, options: StreamOptions = {}): Promise<Result<Plan>> {
  return completeValidated(
    { system: REFINE_SYSTEM, user: buildRefineUserPrompt(plan, instruction), tier: 'strong', task: 'refine', signal },
    normalizePlan,
    options,
  )
}

export function regenerateDay(ctx: TripContext, dayIndex: number, day: Day, note: string | undefined, signal: AbortSignal, options: StreamOptions = {}): Promise<Result<Day>> {
  return completeValidated(
    { system: DAY_SYSTEM, user: buildDayUserPrompt(ctx, dayIndex, day.stops.map((s) => s.name), note), tier: 'fast', task: 'day', signal },
    // Some models wrap the day ({ "day": {...} }); accept both.
    (raw) => normalizeDay(raw && typeof raw === 'object' && 'day' in raw ? (raw as { day: unknown }).day : raw),
    options,
  )
}

export function suggestAlternatives(ctx: TripContext, dayIndex: number, stop: Stop, signal: AbortSignal, options: StreamOptions = {}): Promise<Result<Stop[]>> {
  return completeValidated(
    { system: ALTERNATIVES_SYSTEM, user: buildAlternativesUserPrompt(ctx, dayIndex, stop), tier: 'fast', task: 'alternatives', signal },
    (raw) => normalizeAlternatives(raw, stop.name),
    options,
  )
}

export function runIntake(text: string, signal: AbortSignal, options: StreamOptions = {}): Promise<Result<Intake>> {
  return completeValidated(
    { system: INTAKE_SYSTEM, user: buildIntakeUserPrompt(text), tier: 'fast', task: 'intake', signal },
    normalizeIntake,
    options,
  )
}
