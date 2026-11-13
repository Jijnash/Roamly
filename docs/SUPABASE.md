# Optional cloud sync with Supabase

Roamly is **local-first**: trips are saved in the browser (IndexedDB) and everything works without an account. If Supabase is configured, a **Sign in to sync** button appears. Signing in with an emailed link backs trips up and syncs them across devices.

With no Supabase settings, none of this shows, and `npm install && npm start` works as before.

## Setup (about 5 minutes)

1. Create a free project at [supabase.com](https://supabase.com).
2. **Create the table:** open *SQL Editor → New query*, paste [`supabase/migrations/0001_trips.sql`](../supabase/migrations/0001_trips.sql), and click *Run*. This creates the `trips` table and turns on row-level security.
3. **Allow the sign-in redirect:** under *Authentication → URL Configuration*, set *Site URL* to `http://localhost:3000`. Under *Redirect URLs*, add `http://localhost:3000/**` and, once deployed, your production URL followed by `/**`.
4. **Add the keys:** in *Project Settings → API*, copy the **Project URL** and the **anon** key (newer projects call it the **publishable** key). Put them in `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```
   Never use the `service_role` / secret key. It bypasses row-level security.
5. Restart `npm start`.

Supabase's built-in email sender only allows a few sign-in emails per hour. That's fine for a demo; a real deployment would add its own SMTP provider.

## How it works

| Piece | File | What it does |
|---|---|---|
| Table + security | `supabase/migrations/0001_trips.sql` | One row per trip (`id`, `user_id`, `data` JSON, `updated_at`). Row-level security policies only let `auth.uid() = user_id` read, insert, update or delete a row. That is why the anon key can safely live in the browser. |
| Cloud store | `lib/storage/supabaseTripStore.ts` | Implements the same `TripStore` interface as IndexedDB. Every row is re-validated with `parseStoredTrip`, the same as local data. |
| Sync | `lib/storage/syncedTripStore.ts` | Writes go local first, then to the cloud. Failed cloud writes go on a pending queue. `syncAll()` replays the queue, then reconciles: for each trip, the newer `updatedAt` wins. |
| Sign-in | `hooks/useCloud.ts`, `components/account-menu.tsx` | Passwordless email link. Syncs after sign-in and whenever the browser comes back online. Signing out keeps trips on the device. |

**Known limitation (last write wins):** if the same trip is edited on two devices while both are offline, the edit saved later wins and the other one is lost. A real product would merge per day or per stop, or show both versions.
