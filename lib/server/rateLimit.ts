import 'server-only'

/**
 * Simple fixed-window rate limiter: at most `limitPerMin` requests per key (client IP)
 * per minute. It protects the free AI quota from one client hammering the API.
 *
 * Limitation: counts live in this server process's memory. On serverless hosting each
 * instance keeps its own counts, so the real limit is per instance. That's fine for a
 * demo; a shared store (e.g. Supabase or Redis) would fix it.
 */

type Window = { start: number; count: number }
export type RateLimitResult = { ok: true } | { ok: false; retryAfterSec: number }

const WINDOW_MS = 60_000

export function createRateLimiter(limitPerMin: number, now: () => number = Date.now) {
  const windows = new Map<string, Window>()

  return function check(key: string): RateLimitResult {
    const t = now()
    // Drop expired windows now and then so the map can't grow forever.
    if (windows.size > 5_000) {
      for (const [k, w] of windows) if (t - w.start >= WINDOW_MS) windows.delete(k)
    }

    const current = windows.get(key)
    if (!current || t - current.start >= WINDOW_MS) {
      windows.set(key, { start: t, count: 1 })
      return { ok: true }
    }
    if (current.count >= limitPerMin) {
      return { ok: false, retryAfterSec: Math.ceil((current.start + WINDOW_MS - t) / 1000) }
    }
    current.count++
    return { ok: true }
  }
}
