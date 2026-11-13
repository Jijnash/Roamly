'use client'

import { useCallback, useEffect, useState } from 'react'
import { tripStore } from '@/lib/storage/appStore'
import type { TripSummary } from '@/lib/storage/tripStore'
import { onTripsChanged } from '@/lib/storage/events'

export type SavedTripsState =
  | { status: 'loading' }
  | { status: 'ready'; trips: TripSummary[]; quarantined: number }
  | { status: 'unavailable' }

/** Lists saved trips (local store, kept in sync with the cloud when signed in). `reload` re-reads after a change (delete, duplicate). */
export function useSavedTrips() {
  const [state, setState] = useState<SavedTripsState>({ status: 'loading' })

  const reload = useCallback(async () => {
    try {
      const { trips, quarantined } = await tripStore().list()
      setState({ status: 'ready', trips, quarantined })
    } catch (err) {
      // e.g. storage disabled in a private window
      console.warn('[store] list failed', err)
      setState({ status: 'unavailable' })
    }
  }, [])

  useEffect(() => {
    void reload()
    return onTripsChanged(() => void reload()) // e.g. a cloud sync brought in trips from another device
  }, [reload])

  return { state, reload }
}
