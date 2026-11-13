import 'server-only'
import { AppError } from '@/lib/errors'
import { getConfig } from '@/lib/server/config'
import { createRateLimiter } from '@/lib/server/rateLimit'
import { clientIp } from '@/lib/server/request'

// One limiter shared by every AI route in this server process.
const checkRate = createRateLimiter(getConfig().rateLimitPerMin)

/** Throws RATE_LIMITED if this client has used up its requests for the current minute. */
export function enforceRateLimit(req: Request): void {
  const result = checkRate(clientIp(req))
  if (!result.ok) throw new AppError('RATE_LIMITED', undefined, { retryAfterSec: result.retryAfterSec })
}
