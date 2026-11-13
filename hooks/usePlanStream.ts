'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanEvent } from '@/lib/contracts/types'
import type { ApiError } from '@/lib/api'
import { createRequestGate } from '@/lib/requestGate'
import { runPlanStream } from '@/lib/planStream'

export type StreamPhase = 'idle' | 'streaming' | 'done' | 'error' | 'cancelled'

export type StreamState = {
  phase: StreamPhase
  error: ApiError | null
  /** Set while the server retries an unreadable answer ("Trying once more…"). */
  retryNote: string | null
  /** True when nothing has arrived for SLOW_AFTER_MS; the UI says "Taking longer than usual…". */
  slow: boolean
  /** False when the plan was cut off; the UI then offers "Continue". */
  complete: boolean
  // Metrics for the Reliability lab page.
  requestId: string | null
  provider: string | null
  startedAt: number | null
  firstDayAt: number | null
  finishedAt: number | null
  warningCount: number
}

export const SLOW_AFTER_MS = 8000

const IDLE: StreamState = {
  phase: 'idle', error: null, retryNote: null, slow: false, complete: true,
  requestId: null, provider: null, startedAt: null, firstDayAt: null, finishedAt: null, warningCount: 0,
}

/**
 * React wrapper around runPlanStream: owns the request gate (stale guard), the
 * request status and the "slow" timer. Trip data itself goes to `onEvent` (the trip reducer).
 */
export function usePlanStream(onEvent: (event: PlanEvent) => void) {
  const [state, setState] = useState<StreamState>(IDLE)
  // useRef so these survive re-renders without restarting anything.
  const gate = useRef(createRequestGate())
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  })

  const stopSlowTimer = () => {
    if (slowTimer.current) clearTimeout(slowTimer.current)
    slowTimer.current = null
  }
  /** (Re)start the countdown; any new event pushes it back, so "slow" means "nothing new for 8 s". */
  const restartSlowTimer = (isCurrent: () => boolean) => {
    stopSlowTimer()
    slowTimer.current = setTimeout(() => {
      if (isCurrent()) setState((s) => (s.phase === 'streaming' ? { ...s, slow: true } : s))
    }, SLOW_AFTER_MS)
  }
  useEffect(() => stopSlowTimer, [])

  const start = useCallback((body: unknown) => {
    const ticket = gate.current.begin()
    setState({ ...IDLE, phase: 'streaming', startedAt: Date.now() })
    restartSlowTimer(ticket.isCurrent)

    const finish = (patch: Partial<StreamState>) => {
      stopSlowTimer()
      setState((s) => ({ ...s, ...patch, retryNote: null, slow: false, finishedAt: Date.now() }))
    }

    void runPlanStream(body, ticket, {
      onResponse: (requestId) => setState((s) => ({ ...s, requestId })),
      onEvent: (event) => {
        restartSlowTimer(ticket.isCurrent)
        setState((s) => ({
          ...s,
          slow: false,
          retryNote: null,
          firstDayAt: event.type === 'day' && s.firstDayAt === null ? Date.now() : s.firstDayAt,
          warningCount: s.warningCount + (event.type === 'warning' ? 1 : 0),
        }))
        onEventRef.current(event)
      },
      onRetry: (reason) => {
        restartSlowTimer(ticket.isCurrent)
        setState((s) => ({ ...s, slow: false, retryNote: reason }))
      },
      onDone: (event) => finish({ phase: 'done', complete: event.complete, provider: event.provider }),
      onError: (error) => finish({ phase: 'error', error, requestId: error.requestId !== 'client' ? error.requestId : null }),
    })
  }, [])

  const cancel = useCallback(() => {
    gate.current.cancel()
    stopSlowTimer()
    setState((s) => (s.phase === 'streaming' ? { ...s, phase: 'cancelled', retryNote: null, slow: false, finishedAt: Date.now() } : s))
  }, [])

  return { state, start, cancel }
}
