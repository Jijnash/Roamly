import 'server-only'
import { AppError } from '@/lib/errors'

/**
 * Helpers shared by the real providers (Groq, Gemini): calling the API,
 * turning HTTP failures into typed errors, and reading the
 * Server-Sent Events (SSE) stream both APIs use for streaming.
 */

/** fetch() that turns network failures into UPSTREAM_ERROR and non-2xx responses into typed errors. */
export async function fetchProvider(provider: string, url: string, init: RequestInit): Promise<Response> {
  let res: Response
  try {
    res = await fetch(url, init)
  } catch (err) {
    // A cancel from the browser must stay an abort, not look like a provider failure.
    if (init.signal?.aborted) throw err
    throw new AppError('UPSTREAM_ERROR', undefined, { cause: err })
  }
  if (!res.ok) {
    // Log the provider's message for us; the browser only ever sees our own typed message.
    const detail = (await res.text().catch(() => '')).slice(0, 500)
    console.error(`[ai] ${provider} HTTP ${res.status}: ${detail}`)
    throw httpStatusToError(res.status, res.headers.get('retry-after'))
  }
  if (!res.body) throw new AppError('EMPTY_OUTPUT')
  return res
}

export function httpStatusToError(status: number, retryAfter: string | null): AppError {
  if (status === 429) {
    const seconds = Number.parseInt(retryAfter ?? '', 10)
    return new AppError('RATE_LIMITED', undefined, { retryAfterSec: Number.isFinite(seconds) ? seconds : undefined })
  }
  // 401/403: bad key. 400/404: usually a wrong or retired model ID. Both are setup problems.
  if (status === 400 || status === 401 || status === 403 || status === 404) return new AppError('CONFIG_ERROR')
  return new AppError('UPSTREAM_ERROR')
}

/**
 * Reads an SSE response body and yields the text after each `data:` line.
 * Network chunks can split a line anywhere, so incomplete lines are kept in a
 * buffer until the rest arrives. Both Groq and Gemini put each event on one line.
 */
export async function* readSseData(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line.startsWith('data:')) yield line.slice(5).trim()
      }
    }
    const last = (buffer + decoder.decode()).trim()
    if (last.startsWith('data:')) yield last.slice(5).trim()
  } finally {
    reader.releaseLock()
  }
}

/** Parses one SSE payload as JSON; a garbled event is skipped rather than failing the whole stream. */
export function parseEvent(data: string): unknown {
  try {
    return JSON.parse(data)
  } catch {
    console.warn('[ai] skipped unparseable SSE event')
    return null
  }
}
