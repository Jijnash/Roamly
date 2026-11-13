/**
 * The stale-response guard.
 *
 * Problem: the user submits, then submits again (or cancels) before the first
 * answer arrives. The old response must never overwrite the newer one.
 *
 * Each call to begin():
 *   1. aborts the previous request (so the server stops the model call too), and
 *   2. returns a ticket whose isCurrent() turns false as soon as a newer request begins.
 * Every event handler checks isCurrent() before touching state, so a late event
 * from an old request is simply ignored, even if the abort hasn't landed yet.
 */

export type Ticket = {
  id: number
  signal: AbortSignal
  isCurrent: () => boolean
}

export function createRequestGate() {
  let latestId = 0
  let controller: AbortController | null = null

  return {
    begin(): Ticket {
      controller?.abort()
      const mine = new AbortController()
      controller = mine
      const id = ++latestId
      return { id, signal: mine.signal, isCurrent: () => id === latestId }
    },

    /** Cancel whatever is in flight. Its ticket stops being current, so its late events are ignored. */
    cancel(): void {
      controller?.abort()
      controller = null
      latestId++
    },
  }
}
