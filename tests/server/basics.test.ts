import { describe, expect, it, vi } from 'vitest'
import { AppError, toAppError, toErrorBody } from '@/lib/errors'
import { createRateLimiter } from '@/lib/server/rateLimit'
import { clientIp, errorResponse } from '@/lib/server/request'
import { GET as health } from '@/app/api/health/route'

describe('errors', () => {
  it('gives each code a status and retryable flag', () => {
    expect(new AppError('RATE_LIMITED')).toMatchObject({ status: 429, retryable: true })
    expect(new AppError('INVALID_INPUT')).toMatchObject({ status: 400, retryable: false })
  })

  it('hides unknown error details behind UPSTREAM_ERROR', () => {
    const err = toAppError(new Error('secret internal detail'))
    expect(err.code).toBe('UPSTREAM_ERROR')
    expect(err.message).not.toContain('secret')
  })

  it('builds the standard error body', () => {
    expect(toErrorBody(new AppError('TIMEOUT'), 'req1')).toEqual({
      error: { code: 'TIMEOUT', message: 'The AI took too long to answer.', retryable: true, requestId: 'req1' },
    })
  })

  it('errorResponse sets status, request ID and retry-after', async () => {
    const res = errorResponse(new AppError('RATE_LIMITED', undefined, { retryAfterSec: 9 }), 'abc')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('9')
    expect(res.headers.get('x-request-id')).toBe('abc')
    expect((await res.json()).error.retryAfterSec).toBe(9)
  })
})

describe('rate limiter', () => {
  it('allows up to the limit per minute, then reports when to retry', () => {
    let now = 0
    const check = createRateLimiter(2, () => now)
    expect(check('ip')).toEqual({ ok: true })
    expect(check('ip')).toEqual({ ok: true })
    now = 15_000
    expect(check('ip')).toEqual({ ok: false, retryAfterSec: 45 })
    expect(check('other-ip')).toEqual({ ok: true })
    now = 60_000
    expect(check('ip')).toEqual({ ok: true })
  })
})

describe('clientIp', () => {
  it('uses the first x-forwarded-for entry', () => {
    expect(clientIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } }))).toBe('1.2.3.4')
    expect(clientIp(new Request('http://x'))).toBe('local')
  })
})

describe('GET /api/health', () => {
  it('reports the provider chain without exposing keys', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_secret')
    vi.stubEnv('GEMINI_API_KEY', '')
    vi.stubEnv('LLM_PROVIDER', '')
    const res = health()
    const body = await res.json()
    expect(body).toMatchObject({ ok: true, provider: 'groq', fallback: null, mockMode: false })
    expect(JSON.stringify(body)).not.toContain('gsk_secret')
    expect(res.headers.get('x-request-id')).toBe(body.requestId)
    vi.unstubAllEnvs()
  })
})
