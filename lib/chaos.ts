/**
 * Failure modes the mock provider can reproduce on purpose. Shared by the server
 * (mock provider, request validation) and the browser (Reliability lab page).
 */
export const CHAOS_TRIGGERS = ['malformed', 'garbage', 'wrong-shape', 'empty', 'slow', 'fail', 'ratelimit', 'cutoff'] as const
export type ChaosTrigger = (typeof CHAOS_TRIGGERS)[number]

export function isChaosTrigger(value: unknown): value is ChaosTrigger {
  return typeof value === 'string' && (CHAOS_TRIGGERS as readonly string[]).includes(value)
}
