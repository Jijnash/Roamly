import { toAppError, toErrorBody } from '@/lib/errors'
import { parsePlanRequest, readJsonBody } from '@/lib/contracts/requests'
import type { PlanEvent } from '@/lib/contracts/types'
import { enforceRateLimit } from '@/lib/server/guard'
import { planEvents } from '@/lib/server/plan/planEvents'
import { mockProvider } from '@/lib/server/ai/providers/mock'
import { errorResponse, newRequestId } from '@/lib/server/request'

export const dynamic = 'force-dynamic'

/**
 * POST /api/plan  { text, style?, pace?, interests?, answers?, resume?, chaos? }
 *
 * Problems found before streaming (bad input, rate limit) return a normal JSON error.
 * After that the response is NDJSON (one PlanEvent per line), and a failure is sent
 * as a final {"type":"error"} line, so the browser keeps the days it already has.
 */
export async function POST(req: Request) {
  const requestId = newRequestId()
  let input
  try {
    enforceRateLimit(req)
    input = parsePlanRequest(await readJsonBody(req))
  } catch (err) {
    return errorResponse(toAppError(err), requestId)
  }

  // Abort the model call if the browser disconnects or cancels, so it stops using quota.
  // Two signals for the same thing: the request's own signal, and the stream's cancel().
  const upstream = new AbortController()
  req.signal.addEventListener('abort', () => upstream.abort(), { once: true })

  // Reliability lab: a chaos request always uses the mock provider (no quota used) with that trigger,
  // so every failure can be shown on demand, even when real API keys are configured.
  const events = input.chaos
    ? planEvents({ ...input, text: `${input.text} [${input.chaos}]` }, upstream.signal, { chain: [mockProvider] })
    : planEvents(input, upstream.signal)
  const encoder = new TextEncoder()
  const encode = (event: PlanEvent) => encoder.encode(JSON.stringify(event) + '\n')
  const started = Date.now()

  const body = new ReadableStream<Uint8Array>({
    // pull() runs whenever the client is ready for more, so a slow client slows the model read too.
    async pull(controller) {
      try {
        const { value, done } = await events.next()
        if (done) {
          console.info(`[plan ${requestId}] finished in ${Date.now() - started} ms`)
          controller.close()
          return
        }
        controller.enqueue(encode(value))
      } catch (err) {
        const error = toAppError(err)
        // A cancel is normal (user pressed Cancel or left); nobody is listening, so just stop.
        if (upstream.signal.aborted) {
          console.info(`[plan ${requestId}] cancelled after ${Date.now() - started} ms`)
          controller.close()
          return
        }
        console.warn(`[plan ${requestId}] ${error.code} after ${Date.now() - started} ms`, error.cause ?? '')
        controller.enqueue(encode({ type: 'error', error: toErrorBody(error, requestId).error }))
        controller.close()
      }
    },
    cancel() {
      console.info(`[plan ${requestId}] client disconnected; aborting the model call`)
      upstream.abort()
    },
  })

  return new Response(body, {
    headers: {
      'content-type': 'application/x-ndjson; charset=utf-8',
      'cache-control': 'no-store',
      'x-request-id': requestId,
    },
  })
}
