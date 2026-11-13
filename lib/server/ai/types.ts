import 'server-only'
import type { ProviderName } from '@/lib/server/config'

/** "fast" = small cheap model (intake, small edits). "strong" = bigger model (full plan, whole-trip refine). */
export type ModelTier = 'fast' | 'strong'

export type ModelRequest = {
  system: string
  /** The user's text. Prompts wrap it as data so instructions inside it are not followed. */
  user: string
  tier: ModelTier
  /** Aborted when the browser disconnects or cancels; providers must stop the upstream call. */
  signal: AbortSignal
  /** Ask for one JSON object instead of free text/NDJSON (used by non-streamed calls). */
  json?: boolean
  /** True on the one strict retry after an unusable answer (lets the mock show a successful retry). */
  strict?: boolean
  /** What the answer is for. Real providers ignore it; the mock uses it to pick a matching canned answer. */
  task?: 'plan' | 'refine' | 'day' | 'alternatives' | 'intake'
}

/**
 * Every AI provider has the same shape: it streams the model's text back in chunks.
 * Chunks are raw text with no guaranteed boundaries; parsing happens later (lib/jsonScanner).
 * Providers throw AppError on failure.
 */
export type Provider = {
  name: ProviderName
  stream(req: ModelRequest): AsyncIterable<string>
}
