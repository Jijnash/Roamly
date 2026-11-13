import { describe, expect, it, vi } from 'vitest'
import { POST as plan } from '@/app/api/plan/route'
import { POST as refine } from '@/app/api/refine/route'
import { buildMockPlanObject } from '@/lib/server/ai/providers/mockTrip'

// These call the real route handlers with the default (no-key) config, so they use the mock provider.

let ipCounter = 0
/** Each test gets its own client IP so the shared rate limiter doesn't leak between tests. */
function post(body: unknown, ip = `10.0.0.${++ipCounter}`) {
  return new Request('http://localhost/api/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

async function readNdjson(res: Response) {
  const text = await res.text()
  return text.trim().split('\n').map((line) => JSON.parse(line))
}

describe('POST /api/plan', () => {
  it('streams NDJSON events ending with done', async () => {
    const res = await plan(post({ text: '2 days in Goa' }))
    expect(res.headers.get('content-type')).toContain('application/x-ndjson')
    expect(res.headers.get('x-request-id')).toBeTruthy()
    const events = await readNdjson(res)
    expect(events[0].type).toBe('meta')
    expect(events.at(-1)).toMatchObject({ type: 'done', complete: true, dayCount: 2 })
  })

  it('sends a provider failure as a final error line with the request ID', async () => {
    const res = await plan(post({ text: 'Goa [fail]' }))
    const events = await readNdjson(res)
    expect(events).toEqual([
      { type: 'error', error: { code: 'UPSTREAM_ERROR', message: 'Mock provider failure ([fail] trigger).', retryable: true, requestId: res.headers.get('x-request-id') } },
    ])
  })

  it('a chaos request uses the mock provider even when real keys are set, and never calls out', async () => {
    vi.stubEnv('GROQ_API_KEY', 'gsk_test')
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const events = await readNdjson(await plan(post({ text: '2 days in Goa', chaos: 'wrong-shape' })))
    expect(events.at(-1)).toMatchObject({ type: 'done', provider: 'mock', dayCount: 2 })
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('ignores an unknown chaos value', async () => {
    const events = await readNdjson(await plan(post({ text: '1 day in Goa', chaos: 'drop-database' })))
    expect(events.at(-1)).toMatchObject({ type: 'done', complete: true, dayCount: 1 })
  })

  it('rejects bad input with a 400 JSON error before streaming', async () => {
    const res = await plan(post({ text: '' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error.code).toBe('INVALID_INPUT')
    expect((await plan(post('{not json'))).status).toBe(400)
  })

  it('rate-limits a client after 20 requests a minute', async () => {
    const ip = '10.9.9.9'
    for (let i = 0; i < 20; i++) expect((await plan(post({ text: '' }, ip))).status).toBe(400)
    const res = await plan(post({ text: '' }, ip))
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBeTruthy()
  })
})

describe('POST /api/refine', () => {
  it('returns the refined plan', async () => {
    const res = await refine(post({ plan: buildMockPlanObject(2), instruction: 'more relaxed' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.plan.days).toHaveLength(2)
    expect(body.requestId).toBe(res.headers.get('x-request-id'))
  })

  it('rejects a plan with no usable days', async () => {
    const res = await refine(post({ plan: { days: [] }, instruction: 'x' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatchObject({ code: 'INVALID_INPUT', message: 'The plan to refine is not valid.' })
  })
})

describe('POST /api/day and /api/alternatives', () => {
  const plan = buildMockPlanObject(2)
  const context = { destination: 'Goa', title: 'Goa', days: plan.days.map((d) => ({ title: d.title, stops: d.stops.map((s) => s.name) })) }

  it('rewrites one day with a different day', async () => {
    const res = await (await import('@/app/api/day/route')).POST(post({ context, dayIndex: 1, day: plan.days[1], note: 'more nature' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.day.title).not.toBe(plan.days[1].title)
    expect(body.day.stops.length).toBeGreaterThan(0)
  })

  it('rejects an invalid day', async () => {
    const res = await (await import('@/app/api/day/route')).POST(post({ context, dayIndex: 0, day: { stops: [] } }))
    expect(res.status).toBe(400)
  })

  it('suggests three alternatives not already in the trip', async () => {
    const res = await (await import('@/app/api/alternatives/route')).POST(post({ context, dayIndex: 0, stop: plan.days[0].stops[1] }))
    const body = await res.json()
    expect(body.alternatives).toHaveLength(3)
    const used = new Set(context.days.flatMap((d) => d.stops))
    expect(body.alternatives.every((s: { name: string }) => !used.has(s.name))).toBe(true)
  })
})
