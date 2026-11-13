import 'server-only'
import { AppError, toErrorBody } from '@/lib/errors'

/** Short random ID attached to every response, error card and log line, so a user's report can be matched to the logs. */
export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8)
}

/** Best-effort client IP for rate limiting. Behind a proxy (Vercel), the first x-forwarded-for entry is the client. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local'
}

/** A JSON error response in the standard { error: { code, message, retryable, requestId } } shape. */
export function errorResponse(err: AppError, requestId: string): Response {
  const headers: Record<string, string> = { 'x-request-id': requestId }
  if (err.retryAfterSec !== undefined) headers['retry-after'] = String(err.retryAfterSec)
  return Response.json(toErrorBody(err, requestId), { status: err.status, headers })
}
