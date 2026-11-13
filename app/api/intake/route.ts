import { AppError, toAppError } from '@/lib/errors'
import { LIMITS } from '@/lib/limits'
import { isObject } from '@/lib/contracts/clean'
import { readJsonBody } from '@/lib/contracts/requests'
import { enforceRateLimit } from '@/lib/server/guard'
import { runIntake } from '@/lib/server/plan/edits'
import { errorResponse, newRequestId } from '@/lib/server/request'

export const dynamic = 'force-dynamic'

/** POST /api/intake  { text }  →  { known, questions, requestId } */
export async function POST(req: Request) {
  const requestId = newRequestId()
  try {
    enforceRateLimit(req)
    const body = await readJsonBody(req)
    const text = isObject(body) && typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) throw new AppError('INVALID_INPUT', 'Describe your trip first.')
    if (text.length > LIMITS.inputChars) throw new AppError('INVALID_INPUT', `Keep the trip description under ${LIMITS.inputChars} characters.`)
    const result = await runIntake(text, req.signal)
    return Response.json({ ...result.value, requestId }, { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } })
  } catch (err) {
    const error = toAppError(err)
    if (error.code !== 'INVALID_INPUT') console.warn(`[intake ${requestId}] ${error.code}`, error.cause ?? '')
    return errorResponse(error, requestId)
  }
}
