import { describe, expect, it } from 'vitest'
import { getConfig } from '@/lib/server/config'

describe('getConfig', () => {
  it('runs on the mock provider when no keys are set', () => {
    const cfg = getConfig({})
    expect(cfg.providerChain).toEqual(['mock'])
    expect(cfg.mockMode).toBe(true)
  })

  it('uses Groq with Gemini as fallback when both keys exist', () => {
    const cfg = getConfig({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm' })
    expect(cfg.providerChain).toEqual(['groq', 'gemini'])
    expect(cfg.mockMode).toBe(false)
  })

  it('skips a provider whose key is missing', () => {
    expect(getConfig({ GEMINI_API_KEY: 'm' }).providerChain).toEqual(['gemini'])
    expect(getConfig({ GROQ_API_KEY: 'g' }).providerChain).toEqual(['groq'])
  })

  it('respects LLM_FALLBACK=none and LLM_PROVIDER=mock', () => {
    expect(getConfig({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm', LLM_FALLBACK: 'none' }).providerChain).toEqual(['groq'])
    expect(getConfig({ GROQ_API_KEY: 'g', LLM_PROVIDER: 'mock' }).providerChain).toEqual(['mock'])
  })

  it('ignores whitespace-only keys and bad numbers', () => {
    const cfg = getConfig({ GROQ_API_KEY: '   ', RATE_LIMIT_PER_MIN: 'abc' })
    expect(cfg.providerChain).toEqual(['mock'])
    expect(cfg.rateLimitPerMin).toBe(20)
  })
})
