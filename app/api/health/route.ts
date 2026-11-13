import { getConfig } from '@/lib/server/config'
import { newRequestId } from '@/lib/server/request'

// Read the environment on every request, not once at build time.
export const dynamic = 'force-dynamic'

/** GET /api/health: shows which AI provider is active. Never includes keys. */
export function GET() {
  const requestId = newRequestId()
  const cfg = getConfig()
  return Response.json(
    {
      ok: true,
      provider: cfg.providerChain[0],
      fallback: cfg.providerChain[1] ?? null,
      mockMode: cfg.mockMode,
      requestId,
    },
    { headers: { 'x-request-id': requestId } },
  )
}
