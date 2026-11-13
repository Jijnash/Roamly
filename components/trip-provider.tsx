'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { isObject } from '@/lib/contracts/clean'
import { ModelOutputError, normalizeAlternatives, normalizeDay, normalizePlan } from '@/lib/contracts/plan'
import type { Stop } from '@/lib/contracts/types'
import { clientError, postJson, type ApiError } from '@/lib/api'
import { initHistory, withHistory, type HistoryAction } from '@/lib/state/history'
import { RESETS_HISTORY, UNDOABLE, tripReducer, type TripAction, type TripState } from '@/lib/state/tripReducer'
import { emptyTrip, toPlan, tripContext, type Trip, type TripInput } from '@/lib/state/tripModel'
import { createRequestGate } from '@/lib/requestGate'
import { usePlanStream, type StreamState } from '@/hooks/usePlanStream'
import type { ChaosTrigger } from '@/lib/chaos'
import { tripStore } from '@/lib/storage/appStore'
import type { LoadResult } from '@/lib/storage/tripStore'

/**
 * Holds the current trip for the whole app (it lives in the root layout, so
 * going from the home page to the planner keeps the trip and the running stream).
 *
 * Exposes the trip, undo/redo, the AI actions (start or continue a plan, refine
 * it, rewrite one day, suggest swaps for a stop), and saving: the trip is autosaved to IndexedDB shortly after
 * every change, and openTrip() loads a saved one. While an AI action is running, `busy` is true and
 * the planner locks manual edits, so an AI result never lands on top of a
 * half-made user edit (and vice versa).
 */

export type AiEditKind = 'refine' | 'day'
export type AiEditState = { kind: AiEditKind | null; targetId: string | null; phase: 'idle' | 'working' | 'error'; error: ApiError | null }
const IDLE_EDIT: AiEditState = { kind: null, targetId: null, phase: 'idle', error: null }
export type AlternativesResult = { ok: true; stops: Stop[] } | { ok: false; error: ApiError | null }

/** Warnings the server attached to an edit result (strings only). */
function serverWarnings(body: unknown): string[] {
  return isObject(body) && Array.isArray(body.warnings) ? body.warnings.filter((w): w is string => typeof w === 'string') : []
}
/** 'local' = saved on this device; 'synced' = also in the cloud; 'pending' = cloud copy queued (offline). */
export type SaveState = 'idle' | 'saving' | 'local' | 'synced' | 'pending' | 'error'

type TripContextValue = {
  trip: Trip | null
  canUndo: boolean
  canRedo: boolean
  dispatch: (action: TripAction | HistoryAction) => void
  stream: StreamState
  aiEdit: AiEditState
  busy: boolean
  /** Returns the new trip's id. `chaos` (Reliability lab) applies to this one request only. */
  startPlan: (input: TripInput, options?: { chaos?: ChaosTrigger }) => string
  retryPlan: () => void
  continuePlan: () => void
  cancelPlan: () => void
  refine: (instruction: string) => Promise<boolean>
  regenerateDay: (dayId: string, note?: string) => Promise<boolean>
  cancelEdit: () => void
  fetchAlternatives: (dayId: string, stopId: string) => Promise<AlternativesResult>
  saveState: SaveState
  /** Makes `id` the current trip, loading it from storage if needed. Stops any running AI request first. */
  openTrip: (id: string) => Promise<LoadResult['status']>
}

const TripContext = createContext<TripContextValue | null>(null)

const historyReducer = withHistory<TripState, TripAction>(tripReducer, {
  isUndoable: (a) => UNDOABLE.has(a.type),
  resets: (a) => RESETS_HISTORY.has(a.type),
})

export function TripProvider({ children }: { children: ReactNode }) {
  const [history, dispatch] = useReducer(historyReducer, initHistory<TripState>(null))
  const trip = history.present
  // Keep the latest trip in a ref so the async actions below read current data, not a stale render's.
  const tripRef = useRef(trip)
  useEffect(() => {
    tripRef.current = trip
  }, [trip])

  const { state: stream, start, cancel: cancelPlan } = usePlanStream((event) => dispatch({ type: 'STREAM_EVENT', event }))

  const begin = useCallback((input: TripInput, keep?: Pick<Trip, 'id' | 'createdAt'>, chaos?: ChaosTrigger) => {
    const fresh = { ...emptyTrip(input), ...keep }
    dispatch({ type: 'STREAM_START', trip: fresh })
    start(chaos ? { ...input, chaos } : input)
    return fresh.id
  }, [start])

  const startPlan = useCallback((input: TripInput, options: { chaos?: ChaosTrigger } = {}) => begin(input, undefined, options.chaos), [begin])

  // Retry rebuilds the same trip (same id, so its URL keeps working).
  const retryPlan = useCallback(() => {
    const current = tripRef.current
    if (current) begin(current.input, { id: current.id, createdAt: current.createdAt })
  }, [begin])

  const continuePlan = useCallback(() => {
    const current = tripRef.current
    if (!current || current.days.length === 0) return retryPlan()
    dispatch({ type: 'STREAM_RESUME' })
    start({ ...current.input, resume: { fromDay: current.days.length, previousTitles: current.days.map((d) => d.title) } })
  }, [start, retryPlan])

  // ---- AI edits: refine the whole plan, or rewrite one day ----
  // One at a time, through one request gate (a new edit cancels the previous one).
  // While it runs, manual edits are locked (`busy`), so the result can't clash with them.
  const editGate = useRef(createRequestGate())
  const [aiEdit, setAiEdit] = useState<AiEditState>(IDLE_EDIT)

  const runEdit = useCallback(async (kind: AiEditKind, targetId: string | null, url: string, body: unknown, apply: (body: unknown) => void): Promise<boolean> => {
    const ticket = editGate.current.begin()
    setAiEdit({ kind, targetId, phase: 'working', error: null })
    const result = await postJson(url, body, ticket.signal)
    if (!ticket.isCurrent()) return false
    if (!result.ok) {
      setAiEdit(result.error ? { kind, targetId, phase: 'error', error: result.error } : IDLE_EDIT)
      return false
    }
    try {
      // Re-validate on the client too: never trust a payload just because it came from our server.
      apply(result.body)
    } catch (err) {
      if (!(err instanceof ModelOutputError)) throw err
      setAiEdit({ kind, targetId, phase: 'error', error: clientError('BAD_MODEL_OUTPUT') })
      return false
    }
    setAiEdit(IDLE_EDIT)
    return true
  }, [])

  const refine = useCallback(async (instruction: string) => {
    const current = tripRef.current
    if (!current) return false
    return runEdit('refine', null, '/api/refine', { plan: toPlan(current), instruction }, (body) => {
      const { value, warnings } = normalizePlan(isObject(body) ? body.plan : null)
      dispatch({ type: 'REPLACE_PLAN', plan: value, warnings: [...warnings, ...serverWarnings(body)] })
    })
  }, [runEdit])

  const regenerateDay = useCallback(async (dayId: string, note?: string) => {
    const current = tripRef.current
    const index = current?.days.findIndex((d) => d.id === dayId) ?? -1
    if (!current || index < 0) return false
    const day = toPlan(current).days[index]
    return runEdit('day', dayId, '/api/day', { context: tripContext(current), dayIndex: index, day, note }, (body) => {
      const { value } = normalizeDay(isObject(body) ? body.day : null)
      dispatch({ type: 'REPLACE_DAY', dayId, day: value })
    })
  }, [runEdit])

  const cancelEdit = useCallback(() => {
    editGate.current.cancel()
    setAiEdit(IDLE_EDIT)
  }, [])

  // ---- swap suggestions (read-only until the user picks one, so they don't lock editing) ----
  const swapGate = useRef(createRequestGate())
  const fetchAlternatives = useCallback(async (dayId: string, stopId: string): Promise<AlternativesResult> => {
    const current = tripRef.current
    const index = current?.days.findIndex((d) => d.id === dayId) ?? -1
    const stop = index >= 0 ? current!.days[index].stops.find((s) => s.id === stopId) : undefined
    if (!current || !stop) return { ok: false, error: null }
    const ticket = swapGate.current.begin()
    const { id: _id, done: _done, ...plainStop } = stop
    const result = await postJson('/api/alternatives', { context: tripContext(current), dayIndex: index, stop: plainStop }, ticket.signal)
    if (!ticket.isCurrent()) return { ok: false, error: null }
    if (!result.ok) return { ok: false, error: result.error }
    try {
      return { ok: true, stops: normalizeAlternatives(isObject(result.body) ? result.body.alternatives : null, stop.name).value }
    } catch (err) {
      if (!(err instanceof ModelOutputError)) throw err
      return { ok: false, error: clientError('BAD_MODEL_OUTPUT') }
    }
  }, [])

  // ---- saving ----
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const streaming = stream.phase === 'streaming'

  // Autosave: 600 ms after the trip stops changing. Not while streaming (the trip is still
  // being built); the effect runs again when the stream ends, which saves the finished plan.
  useEffect(() => {
    if (!trip || trip.days.length === 0 || streaming) return
    const timer = setTimeout(() => {
      setSaveState('saving')
      tripStore()
        .save({ ...trip, updatedAt: Date.now() })
        .then((where) => setSaveState(where))
        .catch((err) => {
          console.warn('[store] save failed', err)
          setSaveState('error')
        })
    }, 600)
    return () => clearTimeout(timer)
  }, [trip, streaming])

  const openTrip = useCallback(async (id: string): Promise<LoadResult['status']> => {
    if (tripRef.current?.id === id) return 'ok'
    cancelPlan()
    editGate.current.cancel()
    swapGate.current.cancel()
    setAiEdit(IDLE_EDIT)
    try {
      const result = await tripStore().get(id)
      if (result.status === 'ok') {
        dispatch({ type: 'LOAD', trip: result.trip })
        setSaveState('idle')
      }
      return result.status
    } catch (err) {
      console.warn('[store] load failed', err)
      return 'missing'
    }
  }, [cancelPlan])

  const value = useMemo<TripContextValue>(() => ({
    trip,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    dispatch,
    stream,
    aiEdit,
    busy: stream.phase === 'streaming' || aiEdit.phase === 'working',
    startPlan,
    retryPlan,
    continuePlan,
    cancelPlan,
    refine,
    regenerateDay,
    cancelEdit,
    fetchAlternatives,
    saveState,
    openTrip,
  }), [trip, history.past.length, history.future.length, stream, aiEdit, startPlan, retryPlan, continuePlan, cancelPlan, refine, regenerateDay, cancelEdit, fetchAlternatives, saveState, openTrip])

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>
}

export function useTrip(): TripContextValue {
  const value = useContext(TripContext)
  if (!value) throw new Error('useTrip must be used inside <TripProvider>')
  return value
}
