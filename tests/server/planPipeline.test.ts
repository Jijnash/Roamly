import { describe, expect, it } from 'vitest'
import type { PlanEvent } from '@/lib/contracts/types'
import { parsePlanRequest } from '@/lib/contracts/requests'
import { planEvents } from '@/lib/server/plan/planEvents'
import { refinePlan } from '@/lib/server/plan/edits'
import { createMockProvider } from '@/lib/server/ai/providers/mock'
import type { Provider } from '@/lib/server/ai/types'
import { buildMockPlanObject } from '@/lib/server/ai/providers/mockTrip'
import { normalizePlan } from '@/lib/contracts/plan'
import { collect, caught } from '../helpers'

const fastMock = createMockProvider({ delayScale: 0 })
const timeouts = { firstChunkMs: 1000, idleMs: 1000, totalMs: 5000 }
const signal = () => new AbortController().signal

function run(text: string, extra: Record<string, unknown> = {}, chain: Provider[] = [fastMock]) {
  return collect(planEvents(parsePlanRequest({ text, ...extra }), signal(), { chain, timeouts }))
}
const types = (events: PlanEvent[]) => events.map((e) => e.type)
const done = (events: PlanEvent[]) => events.at(-1) as Extract<PlanEvent, { type: 'done' }>

describe('planEvents', () => {
  it('streams meta, numbered days, sections and a complete done', async () => {
    const events = await run('4 days in Goa')
    expect(types(events)).toEqual(['meta', 'day', 'day', 'day', 'day', 'transport', 'stays', 'info', 'done'])
    expect(events.filter((e) => e.type === 'day').map((e) => (e as { index: number }).index)).toEqual([0, 1, 2, 3])
    expect(done(events)).toMatchObject({ complete: true, dayCount: 4, warningCount: 0, provider: 'mock' })
  })

  it('[malformed]: repairs what it can, skips the cut-off day with a warning', async () => {
    const events = await run('3 days [malformed]')
    expect(events.filter((e) => e.type === 'day')).toHaveLength(2)
    expect(events).toContainEqual({ type: 'warning', message: 'Skipped a line of the plan that was cut off.' })
    expect(events[0]).toMatchObject({ type: 'meta', meta: { title: '3 days in Goa (mock plan)' } }) // trailing comma fixed
    expect(done(events).complete).toBe(true)
  })

  it('[wrong-shape]: accepts the variant shape', async () => {
    const events = await run('Goa [wrong-shape]')
    expect(types(events)).toEqual(['meta', 'day', 'day', 'done'])
    expect(events[1]).toMatchObject({ day: { title: 'Old Goa', stops: [{ name: 'Basilica of Bom Jesus', time: '09:00' }] } })
  })

  it('[garbage]: sends a retry event, then succeeds on the strict retry', async () => {
    const events = await run('Goa [garbage]')
    expect(events[0]).toMatchObject({ type: 'retry' })
    expect(done(events).complete).toBe(true)
  })

  it('[empty]: retries once, then throws EMPTY_OUTPUT', async () => {
    const seen: PlanEvent[] = []
    const err = await caught(async () => {
      for await (const e of planEvents(parsePlanRequest({ text: '[empty]' }), signal(), { chain: [fastMock], timeouts })) seen.push(e)
    })
    expect(types(seen)).toEqual(['retry'])
    expect(err.code).toBe('EMPTY_OUTPUT')
  })

  it('throws BAD_MODEL_OUTPUT when both attempts are unreadable', async () => {
    const prose: Provider = { name: 'mock', async *stream() { yield 'no json here' } }
    expect((await caught(() => run('x', {}, [prose]))).code).toBe('BAD_MODEL_OUTPUT')
  })

  it('[cutoff]: keeps the finished day and reports complete: false', async () => {
    const events = await run('3 days [cutoff]')
    expect(events.filter((e) => e.type === 'day')).toHaveLength(1)
    expect(done(events)).toMatchObject({ complete: false, dayCount: 1 })
    expect(events.some((e) => e.type === 'warning' && /Continue/.test(e.message))).toBe(true)
  })

  it('[fail]: the provider error propagates (the route turns it into an error line)', async () => {
    expect((await caught(() => run('[fail]'))).code).toBe('UPSTREAM_ERROR')
  })

  it('resume: numbers days from fromDay and skips a repeated meta line', async () => {
    const events = await run('2 days', { resume: { fromDay: 2, previousTitles: ['A', 'B'] } })
    expect(events.some((e) => e.type === 'meta')).toBe(false)
    expect(events.filter((e) => e.type === 'day').map((e) => (e as { index: number }).index)).toEqual([2, 3])
  })

  it('adds a default meta when the model sent days only', async () => {
    const daysOnly: Provider = { name: 'mock', async *stream() { yield '{"type":"day","stops":[{"name":"A"}]}\n' } }
    const events = await run('x', {}, [daysOnly])
    expect(types(events)).toEqual(['day', 'meta', 'done'])
  })
})

describe('refinePlan', () => {
  const plan = normalizePlan(buildMockPlanObject(2)).value

  it('returns the validated, edited plan', async () => {
    const result = await refinePlan(plan, 'more relaxed', signal(), { chain: [fastMock], timeouts })
    expect(result.value.days[0].stops).toHaveLength(3)
    expect(result.provider).toBe('mock')
  })

  it('retries once, then throws BAD_MODEL_OUTPUT for unreadable answers', async () => {
    let calls = 0
    const bad: Provider = { name: 'mock', async *stream() { calls++; yield '{"days":"nope"}' } }
    expect((await caught(() => refinePlan(plan, 'x', signal(), { chain: [bad], timeouts }))).code).toBe('BAD_MODEL_OUTPUT')
    expect(calls).toBe(2)
  })
})
