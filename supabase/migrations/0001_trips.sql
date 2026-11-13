-- Roamly cloud sync: one row per trip, owned by the signed-in user.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

create table if not exists public.trips (
  id          text primary key,                                   -- the app's trip id, e.g. trip_3f9a0c2b1e
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data        jsonb not null,                                     -- the whole trip; re-validated by the app on load
  updated_at  timestamptz not null default now(),
  constraint trips_id_format check (id ~ '^trip_[a-z0-9]{4,20}$'),
  constraint trips_data_size check (pg_column_size(data) < 200000)
);

create index if not exists trips_user_updated on public.trips (user_id, updated_at desc);

-- Row-level security: the browser uses the public anon key, so these policies are what
-- stop anyone reading or changing someone else's trips. Every policy checks the owner.
alter table public.trips enable row level security;

create policy "read own trips"   on public.trips for select using (auth.uid() = user_id);
create policy "insert own trips" on public.trips for insert with check (auth.uid() = user_id);
create policy "update own trips" on public.trips for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own trips" on public.trips for delete using (auth.uid() = user_id);
