import { AppError, toAppError } from '@/lib/errors'
import { ModelOutputError, normalizePlan } from '@/lib/contracts/plan'
import { parseRefineRequest, readJsonBody } from '@/lib/contracts/requests'
import { enforceRateLimit } from '@/lib/server/guard'
import { refinePlan } from '@/lib/server/plan/edits'
import { errorResponse, newRequestId } from '@/lib/server/request'

export const dynamic = 'force-dynamic'

/**
 * POST /api/refine  { plan, instruction }  →  { plan, warnings, requestId }
 *
 * The plan comes from the browser, so it is validated like model output before
 * it goes into the prompt (caps its size and drops unknown fields).
 */
export async function POST(req: Request) {
  const requestId = newRequestId()
  try {
    enforceRateLimit(req)
    const { plan: rawPlan, instruction } = parseRefineRequest(await readJsonBody(req))

    let plan
    try {
      plan = normalizePlan(rawPlan).value
    } catch (err) {
      if (err instanceof ModelOutputError) throw new AppError('INVALID_INPUT', 'The plan to refine is not valid.')
      throw err
    }

    const result = await refinePlan(plan, instruction, req.signal)
    return Response.json(
      { plan: result.value, warnings: result.warnings, requestId },
      { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } },
    )
  } catch (err) {
    const error = toAppError(err)
    if (error.code !== 'INVALID_INPUT') console.warn(`[refine ${requestId}] ${error.code}`, error.cause ?? '')
    return errorResponse(error, requestId)
  }
}
