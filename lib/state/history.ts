/**
 * Undo/redo for any reducer.
 *
 * Keeps the state as { past, present, future }. An undoable action that changes
 * the state pushes the old `present` onto `past` (max `limit` entries) and clears
 * `future`. UNDO and REDO move one step between the lists.
 *
 * Because the reducer returns the same object when nothing changed, a no-op edit
 * (e.g. moving a stop that was already removed) never creates an empty undo step.
 */

export type History<S> = { past: S[]; present: S; future: S[] }
export type HistoryAction = { type: 'UNDO' } | { type: 'REDO' }

type Options<A> = {
  /** Which actions get an undo step. */
  isUndoable: (action: A) => boolean
  /** Which actions start fresh (e.g. a new trip): history before them can't be undone into. */
  resets: (action: A) => boolean
  limit?: number
}

export function initHistory<S>(present: S): History<S> {
  return { past: [], present, future: [] }
}

export function withHistory<S, A extends { type: string }>(reducer: (state: S, action: A) => S, options: Options<A>) {
  const limit = options.limit ?? 50

  return function historyReducer(history: History<S>, action: A | HistoryAction): History<S> {
    const { past, present, future } = history

    if (action.type === 'UNDO') {
      if (past.length === 0) return history
      return { past: past.slice(0, -1), present: past[past.length - 1], future: [present, ...future] }
    }
    if (action.type === 'REDO') {
      if (future.length === 0) return history
      return { past: [...past, present], present: future[0], future: future.slice(1) }
    }

    const tripAction = action as A
    const next = reducer(present, tripAction)
    if (options.resets(tripAction)) return initHistory(next)
    if (next === present) return history
    if (options.isUndoable(tripAction)) return { past: [...past, present].slice(-limit), present: next, future: [] }
    return { past, present: next, future }
  }
}
