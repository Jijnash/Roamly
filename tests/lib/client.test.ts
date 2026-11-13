import { describe, expect, it, vi } from 'vitest'
import { createRequestGate } from '@/lib/requestGate'
import { readNdjson } from '@/lib/ndjson'
import { runPlanStream, type PlanStreamHandlers } from '@/lib/planStream'
import { errorFromResponse } from '@/lib/api'
import { googleMapsSearchUrl } from '@/lib/deeplinks'
import { collect, streamResponse } from '../helpers'

describe('createRequestGate (stale-response guard)', () => {
  it('a newer request makes the older ticket stale and aborts it', () => {
    const gate = createRequestGate()
    const first = gate.begin()
    const second = gate.begin()
    expect(first.isCurrent()).toBe(false)
    expect(first.signal.aborted).toBe(true)
    expect(second.isCurrent()).toBe(true)
  })

  it('cancel() aborts and makes the current ticket stale', () => {
    const gate = createRequestGate()
    const ticket = gate.begin()
    gate.cancel()
    expect(ticket.isCurrent()).toBe(false)
    expect(ticket.signal.aborted).toBe(true)
  })
})

describe('readNdjson', () => {
  it('parses lines split across chunks and skips blank or broken lines', async () => {
    const res = streamResponse(['{"a":1}\n{"b"', ':2}\n\nnot json\n{"c":3}'])
    expect(await collect(readNdjson(res.body!))).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
  })
})

const ndjson = (...events: unknown[]) => streamResponse([events.map((e) => JSON.stringify(e)).join('\n') + '\n'], { headers: { 'content-type': 'application/x-ndjson' } })

function handlers() {
  return { onEvent: vi.fn(), onRetry: vi.fn(), onDone: vi.fn(), onError: vi.fn() } satisfies PlanStreamHandlers
}

describe('runPlanStream', () => {
  const meta = { type: 'meta', meta: { title: 'T', destination: '', summary: '', why: [] } }
  const done = { type: 'done', complete: true, dayCount: 0, warningCount: 0, provider: 'mock' }

  it('routes each event to the right handler', async () => {
    const h = handlers()
    const fetchMock = vi.fn().mockResolvedValue(ndjson(meta, { type: 'retry', reason: 'again' }, { type: 'mystery' }, done))
    await runPlanStream({ text: 'x' }, createRequestGate().begin(), h, fetchMock)
    expect(h.onEvent).toHaveBeenCalledWith(meta)
    expect(h.onRetry).toHaveBeenCalledWith('again')
    expect(h.onDone).toHaveBeenCalledWith(done)
    expect(h.onEvent).toHaveBeenCalledTimes(1) // unknown event types are ignored
  })

  it('reports the server request ID as soon as the response arrives', async () => {
    const h = { ...handlers(), onResponse: vi.fn() }
    const res = ndjson(meta, done)
    res.headers.set('x-request-id', 'abc123')
    await runPlanStream({}, createRequestGate().begin(), h, vi.fn().mockResolvedValue(res))
    expect(h.onResponse).toHaveBeenCalledWith('abc123')
  })

  it('passes on an error line', async () => {
    const h = handlers()
    const error = { code: 'TIMEOUT', message: 'slow', retryable: true, requestId: 'r1' }
    await runPlanStream({}, createRequestGate().begin(), h, vi.fn().mockResolvedValue(ndjson(meta, { type: 'error', error })))
    expect(h.onError).toHaveBeenCalledWith(error)
  })

  it('reports a JSON error response (e.g. 429) using the server message', async () => {
    const h = handlers()
    const res = Response.json({ error: { code: 'RATE_LIMITED', message: 'Busy', retryable: true, requestId: 'r2' } }, { status: 429 })
    await runPlanStream({}, createRequestGate().begin(), h, vi.fn().mockResolvedValue(res))
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'RATE_LIMITED', message: 'Busy' }))
  })

  it('reports a stream that ends without done or error as a dropped connection', async () => {
    const h = handlers()
    await runPlanStream({}, createRequestGate().begin(), h, vi.fn().mockResolvedValue(ndjson(meta)))
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'UPSTREAM_ERROR', message: expect.stringMatching(/dropped/) }))
  })

  it('reports a network failure', async () => {
    const h = handlers()
    await runPlanStream({}, createRequestGate().begin(), h, vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'UPSTREAM_ERROR' }))
  })

  it('a stale request never calls its handlers, even if its response arrives last', async () => {
    const gate = createRequestGate()
    const oldHandlers = handlers()
    const newHandlers = handlers()

    // The old request's response is slow; the new one answers first.
    let releaseOld!: (res: Response) => void
    const oldFetch = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { releaseOld = resolve }))
    const oldRun = runPlanStream({ text: 'old' }, gate.begin(), oldHandlers, oldFetch)
    await runPlanStream({ text: 'new' }, gate.begin(), newHandlers, vi.fn().mockResolvedValue(ndjson(meta, done)))
    releaseOld(ndjson({ type: 'meta', meta: { title: 'OLD', destination: '', summary: '', why: [] } }, done))
    await oldRun

    expect(newHandlers.onDone).toHaveBeenCalledOnce()
    expect(oldHandlers.onEvent).not.toHaveBeenCalled()
    expect(oldHandlers.onDone).not.toHaveBeenCalled()
    expect(oldHandlers.onError).not.toHaveBeenCalled()
  })

  it('stops delivering events from a stream that becomes stale midway', async () => {
    const gate = createRequestGate()
    const h = handlers()
    h.onEvent.mockImplementation(() => gate.begin()) // a new request starts after the first event
    await runPlanStream({}, gate.begin(), h, vi.fn().mockResolvedValue(ndjson(meta, meta, done)))
    expect(h.onEvent).toHaveBeenCalledTimes(1)
    expect(h.onDone).not.toHaveBeenCalled()
  })
})

describe('errorFromResponse', () => {
  it('falls back to a generic error when the body is not our shape', async () => {
    const error = await errorFromResponse(new Response('<html>Bad gateway</html>', { status: 502 }))
    expect(error).toMatchObject({ code: 'UPSTREAM_ERROR', retryable: true })
    expect(error.message).toContain('502')
  })
})

describe('googleMapsSearchUrl', () => {
  it('builds an encoded Google Maps search link', () => {
    expect(googleMapsSearchUrl('Fort Aguada', 'Goa')).toBe('https://www.google.com/maps/search/?api=1&query=Fort+Aguada%2C+Goa')
  })

  it('treats a name that looks like a URL as plain text, never as a link', () => {
    const url = googleMapsSearchUrl('https://evil.example/phish')!
    expect(new URL(url).hostname).toBe('www.google.com')
    expect(googleMapsSearchUrl('  ')).toBeNull()
  })
})
