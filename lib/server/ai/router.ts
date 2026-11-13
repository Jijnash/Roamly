import 'server-only'
import { AppError, toAppError } from '@/lib/errors'
import { getConfig, type ProviderName, type ServerConfig } from '@/lib/server/config'
import type { ModelRequest, Provider } from '@/lib/server/ai/types'
import { withTimeouts, type StreamTimeouts } from '@/lib/server/ai/timeouts'
import { mockProvider } from '@/lib/server/ai/providers/mock'
import { createGroqProvider } from '@/lib/server/ai/providers/groq'
import { createGeminiProvider } from '@/lib/server/ai/providers/gemini'

/** Turns the configured provider names into provider objects, in fallback order. */
export function getProviderChain(cfg: ServerConfig = getConfig()): Provider[] {
  return cfg.providerChain.map((name) => {
    if (name === 'groq') return createGroqProvider(cfg.groq)
    if (name === 'gemini') return createGeminiProvider(cfg.gemini)
    return mockProvider
  })
}

export type StreamOptions = {
  chain?: Provider[]
  timeouts?: StreamTimeouts
  /** Called once with the provider that actually answered (for logs and the dev panel). */
  onProvider?: (name: ProviderName) => void
}

/**
 * Streams text from the first provider that works.
 *
 * Fallback rule: if a provider fails *before sending any text* (bad key, rate limit,
 * outage, slow first chunk), try the next one. Once text has started we can't switch,
 * because the client already has part of the answer, so the error is passed on and
 * the UI offers Retry / Continue.
 *
 * A cancel from the browser (req.signal) never triggers a fallback.
 */
export async function* streamModel(req: ModelRequest, options: StreamOptions = {}): AsyncGenerator<string> {
  const chain = options.chain ?? getProviderChain()
  const timeouts = options.timeouts ?? getConfig().timeouts
  let lastError: AppError = new AppError('CONFIG_ERROR', 'No AI provider is configured.')

  for (const [index, provider] of chain.entries()) {
    // One controller per attempt so a timeout aborts only this provider's request.
    const attempt = new AbortController()
    const signal = AbortSignal.any([req.signal, attempt.signal])
    let started = false

    try {
      const chunks = withTimeouts(provider.stream({ ...req, signal }), timeouts, () => attempt.abort())
      for await (const chunk of chunks) {
        if (!started) {
          started = true
          options.onProvider?.(provider.name)
        }
        yield chunk
      }
      return
    } catch (err) {
      if (req.signal.aborted) throw new AppError('CANCELLED', undefined, { cause: err })
      lastError = toAppError(err)
      const next = chain[index + 1]
      if (started || !next) throw lastError
      console.warn(`[ai] ${provider.name} failed (${lastError.code}); falling back to ${next.name}`)
    }
  }
  throw lastError
}

/** Non-streamed helper: collects the whole answer as one string. */
export async function completeModel(req: ModelRequest, options: StreamOptions = {}): Promise<string> {
  let text = ''
  for await (const chunk of streamModel(req, options)) text += chunk
  return text
}
