/**
 * Typed errors shared by the server and the client.
 *
 * The server never sends stack traces or raw provider messages to the browser.
 * Every failure is turned into one of these codes, with a short message the UI
 * can show as-is and a `retryable` flag that decides whether to offer "Retry".
 */

export const ERROR_CODES = [
  'INVALID_INPUT',
  'RATE_LIMITED',
  'TIMEOUT',
  'UPSTREAM_ERROR',
  'BAD_MODEL_OUTPUT',
  'EMPTY_OUTPUT',
  'CONFIG_ERROR',
  'NOT_FOUND',
  'CANCELLED',
  'OFFLINE',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

/** The JSON body every API error response uses. */
export type ErrorBody = {
  error: { code: ErrorCode; message: string; retryable: boolean; requestId: string; retryAfterSec?: number }
}

const DEFAULTS: Record<ErrorCode, { status: number; retryable: boolean; message: string }> = {
  INVALID_INPUT: { status: 400, retryable: false, message: 'That request was not valid.' },
  RATE_LIMITED: { status: 429, retryable: true, message: 'Roamly is busy right now. Please try again in a moment.' },
  TIMEOUT: { status: 504, retryable: true, message: 'The AI took too long to answer.' },
  UPSTREAM_ERROR: { status: 502, retryable: true, message: 'The AI service had a problem.' },
  BAD_MODEL_OUTPUT: { status: 502, retryable: true, message: "The AI's answer could not be understood." },
  EMPTY_OUTPUT: { status: 502, retryable: true, message: 'The AI returned an empty answer.' },
  CONFIG_ERROR: { status: 500, retryable: false, message: 'The server is not configured correctly.' },
  NOT_FOUND: { status: 404, retryable: false, message: 'Not found.' },
  CANCELLED: { status: 499, retryable: true, message: 'The request was cancelled.' },
  // Only created in the browser, when the request never reached the server.
  OFFLINE: { status: 503, retryable: true, message: "You're offline. Saved trips still work; AI needs a connection." },
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly retryable: boolean
  readonly status: number
  readonly retryAfterSec?: number

  constructor(code: ErrorCode, message?: string, options: { retryAfterSec?: number; cause?: unknown } = {}) {
    super(message ?? DEFAULTS[code].message, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.retryable = DEFAULTS[code].retryable
    this.status = DEFAULTS[code].status
    this.retryAfterSec = options.retryAfterSec
  }
}

/** Anything thrown → an AppError. Unknown errors become a generic UPSTREAM_ERROR (their details stay in server logs). */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error && err.name === 'AbortError') return new AppError('CANCELLED', undefined, { cause: err })
  return new AppError('UPSTREAM_ERROR', undefined, { cause: err })
}

export function toErrorBody(err: AppError, requestId: string): ErrorBody {
  return {
    error: {
      code: err.code,
      message: err.message,
      retryable: err.retryable,
      requestId,
      ...(err.retryAfterSec !== undefined && { retryAfterSec: err.retryAfterSec }),
    },
  }
}
