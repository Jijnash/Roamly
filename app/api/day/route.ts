import { AppError, toAppError } from '@/lib/errors'
import { ModelOutputError, normalizeDay } from '@/lib/contracts/plan'
import { parseDayRequest, readJsonBody } from '@/lib/contracts/requests'
import { enforceRateLimit } from '@/lib/server/guard'
import { regenerateDay } from '@/lib/server/plan/edits'
import { errorResponse, newRequestId } from '@/lib/server/request'

export const dynamic = 'force-dynamic'

/** POST /api/day  { context, dayIndex, day, note? }  →  { day, warnings, requestId } */
export async function POST(req: Request) {
  const requestId = newRequestId()
  try {
    enforceRateLimit(req)
    const { context, dayIndex, day: rawDay, note } = parseDayRequest(await readJsonBody(req))
    let day
    try {
      day = normalizeDay(rawDay).value
    } catch (err) {
      if (err instanceof ModelOutputError) throw new AppError('INVALID_INPUT', 'The day to rewrite is not valid.')
      throw err
    }
    const result = await regenerateDay(context, dayIndex, day, note, req.signal)
    return Response.json({ day: result.value, warnings: result.warnings, requestId }, { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } })
  } catch (err) {
    const error = toAppError(err)
    if (error.code !== 'INVALID_INPUT') console.warn(`[day ${requestId}] ${error.code}`, error.cause ?? '')
    return errorResponse(error, requestId)
  }
}
