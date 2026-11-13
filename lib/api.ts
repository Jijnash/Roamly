import { AppError, ERROR_CODES, toErrorBody, type ErrorBody } from '@/lib/errors'
import { isObject } from '@/lib/contracts/clean'

/** Browser-side helpers for calling our API and turning every failure into the standard error shape. */

export type ApiError = ErrorBody['error']

/** Builds an ApiError for failures that happen in the browser (no server request ID). */
export function clientError(code: AppError['code'], message?: string): ApiError {
  return toErrorBody(new AppError(code, message), 'client').error
}

/** Reads a JSON error body from a failed response; falls back to a generic error if it isn't our shape. */
export async function errorFromResponse(res: Response): Promise<ApiError> {
  try {
    const body = await res.json()
    const e = isObject(body) && isObject(body.error) ? body.error : null
    if (e && typeof e.code === 'string' && (ERROR_CODES as readonly string[]).includes(e.code) && typeof e.message === 'string') {
      return e as ApiError
    }
  } catch {
    // not JSON: fall through
  }
  return clientError('UPSTREAM_ERROR', `The server answered with an unexpected error (HTTP ${res.status}).`)
}

/** A fetch() that failed before any response: offline, or the network dropped. */
export function networkError(): ApiError {
  return typeof navigator !== 'undefined' && navigator.onLine === false
    ? clientError('OFFLINE')
    : clientError('UPSTREAM_ERROR', "Couldn't reach Roamly. Check your connection and try again.")
}

export function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

/**
 * POST JSON to one of our routes and return either the parsed body or an ApiError.
 * Never throws for HTTP or network failures; an abort (user cancelled) comes back as error: null.
 */
export async function postJson(url: string, body: unknown, signal: AbortSignal): Promise<{ ok: true; body: unknown } | { ok: false; error: ApiError | null }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })
    if (!res.ok) return { ok: false, error: await errorFromResponse(res) }
    return { ok: true, body: await res.json() }
  } catch (err) {
    return { ok: false, error: isAbort(err) ? null : networkError() }
  }
}
