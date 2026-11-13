import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import { streamModel } from '@/lib/server/ai/router'
import { withTimeouts } from '@/lib/server/ai/timeouts'
import type { Provider } from '@/lib/server/ai/types'
import { collect, caught } from '../helpers'

const timeouts = { firstChunkMs: 200, idleMs: 200, totalMs: 1000 }
const req = (signal = new AbortController().signal) => ({ system: 's', user: 'u', tier: 'fast' as const, signal })

/** Fake provider that yields `chunks`, optionally throwing `error` after them. */
function fake(name: Provider['name'], chunks: string[], error?: AppError): Provider {
  return {
    name,
    async *stream() {
      for (const c of chunks) yield c
      if (error) throw error
    },
  }
}

/** Fake provider that never answers until aborted. */
function hanging(name: Provider['name']): Provider & { aborted: () => boolean } {
  let wasAborted = false
  return {
    name,
    aborted: () => wasAborted,
    async *stream({ signal }) {
      await new Promise((_, reject) => signal.addEventListener('abort', () => { wasAborted = true; reject(signal.reason) }))
      yield 'never'
    },
  }
}

describe('streamModel', () => {
  it('uses the first provider when it works', async () => {
    const onProvider = vi.fn()
    const out = await collect(streamModel(req(), { chain: [fake('groq', ['a', 'b']), fake('gemini', ['x'])], timeouts, onProvider }))
    expect(out.join('')).toBe('ab')
    expect(onProvider).toHaveBeenCalledWith('groq')
  })

  it('falls back when the first provider fails before sending text', async () => {
    const onProvider = vi.fn()
    const chain = [fake('groq', [], new AppError('RATE_LIMITED')), fake('gemini', ['ok'])]
    const out = await collect(streamModel(req(), { chain, timeouts, onProvider }))
    expect(out.join('')).toBe('ok')
    expect(onProvider).toHaveBeenCalledWith('gemini')
  })

  it('does not fall back once text has started (the error is passed on)', async () => {
    const chain = [fake('groq', ['partial'], new AppError('UPSTREAM_ERROR')), fake('gemini', ['ok'])]
    const received: string[] = []
    const err = await caught(async () => {
      for await (const c of streamModel(req(), { chain, timeouts })) received.push(c)
    })
    expect(received).toEqual(['partial'])
    expect(err.code).toBe('UPSTREAM_ERROR')
  })

  it('throws the last error when every provider fails', async () => {
    const chain = [fake('groq', [], new AppError('CONFIG_ERROR')), fake('gemini', [], new AppError('RATE_LIMITED'))]
    expect((await caught(() => collect(streamModel(req(), { chain, timeouts })))).code).toBe('RATE_LIMITED')
  })

  it('turns unknown errors into UPSTREAM_ERROR', async () => {
    const broken: Provider = { name: 'groq', async *stream() { throw new TypeError('boom') } }
    expect((await caught(() => collect(streamModel(req(), { chain: [broken], timeouts })))).code).toBe('UPSTREAM_ERROR')
  })

  it('times out a silent provider, aborts it, and falls back', async () => {
    const slow = hanging('groq')
    const out = await collect(streamModel(req(), { chain: [slow, fake('gemini', ['ok'])], timeouts: { ...timeouts, firstChunkMs: 30 } }))
    expect(out.join('')).toBe('ok')
    expect(slow.aborted()).toBe(true)
  })

  it('does not fall back when the client cancels', async () => {
    const controller = new AbortController()
    const backup = vi.fn()
    const chain: Provider[] = [hanging('groq'), { name: 'gemini', async *stream() { backup(); yield 'x' } }]
    setTimeout(() => controller.abort(), 20)
    const err = await caught(() => collect(streamModel(req(controller.signal), { chain, timeouts })))
    expect(err.code).toBe('CANCELLED')
    expect(backup).not.toHaveBeenCalled()
  })
})

describe('withTimeouts', () => {
  async function* gaps(ms: number[]) {
    for (const wait of ms) {
      await new Promise((r) => setTimeout(r, wait))
      yield wait
    }
  }

  it('passes chunks through when they arrive in time', async () => {
    expect(await collect(withTimeouts(gaps([5, 5]), timeouts, () => {}))).toEqual([5, 5])
  })

  it('throws TIMEOUT when a later chunk stalls, and calls onTimeout', async () => {
    const onTimeout = vi.fn()
    const err = await caught(() => collect(withTimeouts(gaps([5, 300]), { ...timeouts, idleMs: 30 }, onTimeout)))
    expect(err.code).toBe('TIMEOUT')
    expect(onTimeout).toHaveBeenCalledOnce()
  })

  it('enforces the total cap even when every gap is short', async () => {
    const err = await caught(() => collect(withTimeouts(gaps([20, 20, 20, 20, 20]), { firstChunkMs: 100, idleMs: 100, totalMs: 50 }, () => {})))
    expect(err.code).toBe('TIMEOUT')
  })
})
