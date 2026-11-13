import { afterEach, describe, expect, it, vi } from 'vitest'
import { createGroqProvider } from '@/lib/server/ai/providers/groq'
import { createGeminiProvider } from '@/lib/server/ai/providers/gemini'
import { readSseData } from '@/lib/server/ai/http'
import { collect, caught, streamResponse } from '../helpers'

const groq = createGroqProvider({ apiKey: 'test-key', modelFast: 'fast-model', modelStrong: 'strong-model' })
const gemini = createGeminiProvider({ apiKey: 'test-key', modelFast: 'flash-lite', modelStrong: 'flash' })
const req = { system: 'sys', user: 'trip', tier: 'strong' as const, signal: new AbortController().signal }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('readSseData', () => {
  it('rebuilds data lines split across network chunks and ignores other lines', async () => {
    const res = streamResponse([': comment\nda', 'ta: {"a":1}\r\n\ndata: [DO', 'NE]\n'])
    expect(await collect(readSseData(res.body!))).toEqual(['{"a":1}', '[DONE]'])
  })

  it('yields a final data line that has no trailing newline', async () => {
    expect(await collect(readSseData(streamResponse(['data: last']).body!))).toEqual(['last'])
  })
})

describe('Groq provider', () => {
  it('sends the strong model with the key in a header and yields text deltas', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      'data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"reasoning":"thinking…"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\n\ndata: [DONE]\n\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    expect((await collect(groq.stream(req))).join('')).toBe('Hello')
    const [, init] = fetchMock.mock.calls[0]
    expect(JSON.parse(init.body).model).toBe('strong-model')
    expect(init.headers.Authorization).toBe('Bearer test-key')
  })

  it('maps HTTP 429 to RATE_LIMITED with retry-after, without leaking the provider message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('quota exceeded for org xyz', { status: 429, headers: { 'retry-after': '7' } })))
    const err = await caught(() => collect(groq.stream(req)))
    expect(err.code).toBe('RATE_LIMITED')
    expect(err.retryAfterSec).toBe(7)
    expect(err.message).not.toContain('xyz')
  })

  it('maps a bad key (401) to CONFIG_ERROR and a network failure to UPSTREAM_ERROR', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })))
    expect((await caught(() => collect(groq.stream(req)))).code).toBe('CONFIG_ERROR')

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))
    expect((await caught(() => collect(groq.stream(req)))).code).toBe('UPSTREAM_ERROR')
  })

  it('turns an error event inside the stream into UPSTREAM_ERROR', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(streamResponse(['data: {"error":{"message":"overloaded"}}\n'])))
    expect((await caught(() => collect(groq.stream(req)))).code).toBe('UPSTREAM_ERROR')
  })
})

describe('Gemini provider', () => {
  it('calls the right model, keeps the key out of the URL, and skips thought parts', async () => {
    const fetchMock = vi.fn().mockResolvedValue(streamResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"plan…","thought":true}]}}]}\r\n\r\n',
      'data: {"candidates":[{"content":{"parts":[{"text":"{\\"a\\":"},{"text":"1}"}]}}]}\r\n\r\n',
    ]))
    vi.stubGlobal('fetch', fetchMock)

    expect((await collect(gemini.stream({ ...req, tier: 'fast', json: true }))).join('')).toBe('{"a":1}')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('/flash-lite:streamGenerateContent?alt=sse')
    expect(url).not.toContain('test-key')
    expect(init.headers['x-goog-api-key']).toBe('test-key')
    expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe('application/json')
  })

  it('maps HTTP 404 (wrong model ID) to CONFIG_ERROR', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('model not found', { status: 404 })))
    expect((await caught(() => collect(gemini.stream(req)))).code).toBe('CONFIG_ERROR')
  })
})
