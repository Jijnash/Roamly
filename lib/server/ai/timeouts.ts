import 'server-only'
import { AppError } from '@/lib/errors'

export type StreamTimeouts = {
  /** Max wait for the first chunk (the model may "think" first). */
  firstChunkMs: number
  /** Max gap between later chunks; catches a stream that silently stalls. */
  idleMs: number
  /** Hard cap on the whole stream. */
  totalMs: number
}

/**
 * Passes chunks through from `source`, but throws TIMEOUT if one takes too long.
 * `onTimeout` is called first so the caller can abort the upstream request;
 * otherwise the provider would keep generating (and costing) after we gave up.
 */
export async function* withTimeouts<T>(
  source: AsyncIterable<T>,
  timeouts: StreamTimeouts,
  onTimeout: () => void,
): AsyncGenerator<T> {
  const iterator = source[Symbol.asyncIterator]()
  const deadline = Date.now() + timeouts.totalMs
  let gotFirst = false

  try {
    while (true) {
      const wait = Math.min(gotFirst ? timeouts.idleMs : timeouts.firstChunkMs, deadline - Date.now())
      let timer: ReturnType<typeof setTimeout> | undefined
      const timedOut = new Promise<'timeout'>((resolve) => {
        timer = setTimeout(() => resolve('timeout'), Math.max(wait, 0))
      })

      const result = await Promise.race([iterator.next(), timedOut]).finally(() => clearTimeout(timer))
      if (result === 'timeout') {
        onTimeout()
        throw new AppError('TIMEOUT')
      }
      if (result.done) return
      gotFirst = true
      yield result.value
    }
  } finally {
    // Let the provider clean up (close its reader). Not awaited: after a timeout its
    // pending read only settles once the abort lands, and we must not hang on it.
    iterator.return?.(undefined)?.catch(() => {})
  }
}
