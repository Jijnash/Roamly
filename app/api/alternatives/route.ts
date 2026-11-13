import { AppError, toAppError } from '@/lib/errors'
import { normalizeStop } from '@/lib/contracts/plan'
import { parseAlternativesRequest, readJsonBody } from '@/lib/contracts/requests'
import { enforceRateLimit } from '@/lib/server/guard'
import { suggestAlternatives } from '@/lib/server/plan/edits'
import { errorResponse, newRequestId } from '@/lib/server/request'

export const dynamic = 'force-dynamic'

/** POST /api/alternatives  { context, dayIndex, stop }  →  { alternatives: Stop[], warnings, requestId } */
export async function POST(req: Request) {
  const requestId = newRequestId()
  try {
    enforceRateLimit(req)
    const { context, dayIndex, stop: rawStop } = parseAlternativesRequest(await readJsonBody(req))
    const stop = normalizeStop(rawStop)
    if (!stop) throw new AppError('INVALID_INPUT', 'The stop to replace is not valid.')
    const result = await suggestAlternatives(context, dayIndex, stop, req.signal)
    return Response.json({ alternatives: result.value, warnings: result.warnings, requestId }, { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } })
  } catch (err) {
    const error = toAppError(err)
    if (error.code !== 'INVALID_INPUT') console.warn(`[alternatives ${requestId}] ${error.code}`, error.cause ?? '')
    return errorResponse(error, requestId)
  }
}
