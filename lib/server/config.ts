import 'server-only'

/**
 * Reads server settings from environment variables.
 *
 * Takes `env` as a parameter (default: process.env) so tests can pass a plain
 * object instead of changing the real environment.
 */

export type ProviderName = 'groq' | 'gemini' | 'mock'

export type ServerConfig = {
  /** Providers to try in order. The router falls back to the next one on failure. */
  providerChain: ProviderName[]
  /** True when no AI keys are set, so the mock provider is used. */
  mockMode: boolean
  groq: { apiKey: string; modelFast: string; modelStrong: string }
  gemini: { apiKey: string; modelFast: string; modelStrong: string }
  timeouts: { firstChunkMs: number; idleMs: number; totalMs: number }
  rateLimitPerMin: number
}

function readInt(value: string | undefined, fallback: number): number {
  const n = Number.parseInt(value ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function getConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const groq = {
    apiKey: env.GROQ_API_KEY?.trim() ?? '',
    modelFast: env.GROQ_MODEL_FAST?.trim() || 'openai/gpt-oss-20b',
    modelStrong: env.GROQ_MODEL_STRONG?.trim() || 'openai/gpt-oss-120b',
  }
  const gemini = {
    apiKey: env.GEMINI_API_KEY?.trim() ?? '',
    modelFast: env.GEMINI_MODEL_FAST?.trim() || 'gemini-3.5-flash-lite',
    modelStrong: env.GEMINI_MODEL_STRONG?.trim() || 'gemini-3.8-flash',
  }
  const hasKey = { groq: groq.apiKey !== '', gemini: gemini.apiKey !== '', mock: true }

  const requested = (env.LLM_PROVIDER?.trim() || 'groq') as ProviderName
  const fallback = (env.LLM_FALLBACK?.trim() || 'gemini') as ProviderName | 'none'

  // Build the chain from what was asked for, but only keep providers that have a key.
  // If nothing usable is left, run on the mock so `npm start` always works.
  let providerChain: ProviderName[] = []
  if (requested === 'mock') {
    providerChain = ['mock']
  } else {
    for (const name of [requested, fallback]) {
      if ((name === 'groq' || name === 'gemini') && hasKey[name] && !providerChain.includes(name)) {
        providerChain.push(name)
      }
    }
    if (providerChain.length === 0) providerChain = ['mock']
  }

  return {
    providerChain,
    mockMode: providerChain[0] === 'mock',
    groq,
    gemini,
    timeouts: {
      firstChunkMs: readInt(env.LLM_TIMEOUT_MS, 30_000),
      idleMs: readInt(env.STREAM_IDLE_TIMEOUT_MS, 20_000),
      totalMs: readInt(env.STREAM_TOTAL_TIMEOUT_MS, 90_000),
    },
    rateLimitPerMin: readInt(env.RATE_LIMIT_PER_MIN, 20),
  }
}
