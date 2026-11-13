import { describe, expect, it } from 'vitest'
import { createMockProvider, daysFromText, findTrigger } from '@/lib/server/ai/providers/mock'
import { collect, caught } from '../helpers'

// delayScale 0: no artificial waits, so the tests run instantly.
const mockProvider = createMockProvider({ delayScale: 0 })

const run = (user: string, signal = new AbortController().signal, json = false, strict = false) =>
  collect(mockProvider.stream({ system: '', user, tier: 'strong', signal, json, strict })).then((c) => c.join(''))

describe('mock provider', () => {
  it('streams one valid JSON object per line, with one day line per requested day', async () => {
    const text = await run('4 days in Goa')
    const lines = text.split('\n').map((l) => JSON.parse(l))
    expect(lines[0].type).toBe('meta')
    expect(lines.filter((l) => l.type === 'day')).toHaveLength(4)
    expect(lines.at(-1).type).toBe('info')
  })

  it('returns a single, visibly changed plan object when json (refine) is requested', async () => {
    const plan = JSON.parse(await run('2 days', undefined, true))
    expect(plan.days).toHaveLength(2)
    expect(plan.days[0].stops).toHaveLength(3) // sample day 1 has 4 stops; refine drops the last
    expect(plan.summary).toMatch(/Mock refine/)
  })

  it('[garbage] returns prose, then valid output on the strict retry', async () => {
    expect(await run('Goa [garbage]')).not.toContain('{')
    expect((await run('Goa [garbage]', undefined, false, true)).split('\n')[0]).toContain('"type":"meta"')
  })

  it('[empty] returns nothing', async () => {
    expect(await run('Goa [empty]')).toBe('')
  })

  it('[malformed] returns text that is not valid NDJSON', async () => {
    const text = await run('Goa [malformed]')
    expect(text).toContain('```')
    expect(() => text.split('\n').forEach((l) => JSON.parse(l))).toThrow()
  })

  it('[wrong-shape] returns valid JSON with unexpected keys', async () => {
    const parsed = JSON.parse(await run('Goa [wrong-shape]'))
    expect(parsed.itinerary).toBeDefined()
    expect(parsed.days).toBeUndefined()
  })

  it('[cutoff] stops in the middle of the second day', async () => {
    const lines = (await run('3 days [cutoff]')).split('\n')
    expect(lines).toHaveLength(3)
    expect(() => JSON.parse(lines[2])).toThrow()
  })

  it('[fail] and [ratelimit] throw typed errors', async () => {
    expect((await caught(() => run('[fail]'))).code).toBe('UPSTREAM_ERROR')
    const limited = await caught(() => run('[ratelimit]'))
    expect(limited.code).toBe('RATE_LIMITED')
    expect(limited.retryAfterSec).toBe(20)
  })

  it('stops when the request is aborted', async () => {
    const controller = new AbortController()
    const iterator = createMockProvider().stream({ system: '', user: '3 days', tier: 'strong', signal: controller.signal })[Symbol.asyncIterator]()
    await iterator.next()
    controller.abort()
    await expect(iterator.next()).rejects.toBeDefined()
  })
})

describe('mock helpers', () => {
  it('finds triggers case-insensitively', () => {
    expect(findTrigger('Goa [SLOW] please')).toBe('slow')
    expect(findTrigger('Goa')).toBeNull()
  })

  it('reads the day count from the text', () => {
    expect(daysFromText('5 days in Kerala')).toBe(5)
    expect(daysFromText('a 2-day trip')).toBe(2)
    expect(daysFromText('weekend in Goa')).toBe(3)
  })
})
