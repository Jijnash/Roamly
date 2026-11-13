import { isObject } from '@/lib/contracts/clean'
import type { PlanEvent } from '@/lib/contracts/types'
import { clientError, errorFromResponse, isAbort, networkError, type ApiError } from '@/lib/api'
import { readNdjson } from '@/lib/ndjson'
import type { Ticket } from '@/lib/requestGate'

/**
 * Browser side of /api/plan: POST the request, read NDJSON events, hand each one
 * to the right callback. Plain async function (no React) so it can be unit-tested.
 *
 * Every step checks ticket.isCurrent(): once a newer request has started, or the
 * user cancelled, this one goes quiet and never touches state again.
 */

export type PlanStreamHandlers = {
  /** Called once the server answers, with its request ID (shown in errors and the lab page). */
  onResponse?: (requestId: string | null) => void
  onEvent: (event: PlanEvent) => void
  onRetry: (reason: string) => void
  onDone: (event: Extract<PlanEvent, { type: 'done' }>) => void
  onError: (error: ApiError) => void
}

const EVENT_TYPES = new Set(['meta', 'day', 'transport', 'stays', 'info', 'warning', 'retry', 'error', 'done'])

function isPlanEvent(value: unknown): value is PlanEvent {
  return isObject(value) && typeof value.type === 'string' && EVENT_TYPES.has(value.type)
}

export async function runPlanStream(
  body: unknown,
  ticket: Ticket,
  handlers: PlanStreamHandlers,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let res: Response
  try {
    res = await fetchImpl('/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ticket.signal,
    })
  } catch (err) {
    if (ticket.isCurrent() && !isAbort(err)) handlers.onError(networkError())
    return
  }
  if (!ticket.isCurrent()) return
  handlers.onResponse?.(res.headers.get('x-request-id'))

  if (!res.ok || !res.body) {
    const error = await errorFromResponse(res)
    if (ticket.isCurrent()) handlers.onError(error)
    return
  }

  try {
    for await (const event of readNdjson(res.body)) {
      if (!ticket.isCurrent()) return
      if (!isPlanEvent(event)) continue
      if (event.type === 'error') return handlers.onError(event.error)
      if (event.type === 'done') return handlers.onDone(event)
      if (event.type === 'retry') handlers.onRetry(event.reason)
      else handlers.onEvent(event)
    }
  } catch (err) {
    if (!ticket.isCurrent() || isAbort(err)) return
  }
  // The body ended without "done" or "error": the connection dropped mid-plan.
  if (ticket.isCurrent()) handlers.onError(clientError('UPSTREAM_ERROR', 'The connection dropped before the plan finished.'))
}
