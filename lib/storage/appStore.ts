import { createIdbTripStore } from '@/lib/storage/tripStore'
import { browserPendingQueue, createSyncedTripStore, type SyncedTripStore } from '@/lib/storage/syncedTripStore'
import { currentCloudStore } from '@/lib/storage/supabaseTripStore'

let shared: SyncedTripStore | null = null

/**
 * The app's store: IndexedDB first, plus Supabase sync while the user is signed in.
 * Created on first use, so nothing touches IndexedDB during server rendering.
 */
export function tripStore(): SyncedTripStore {
  shared ??= createSyncedTripStore(createIdbTripStore(), currentCloudStore, browserPendingQueue())
  return shared
}
