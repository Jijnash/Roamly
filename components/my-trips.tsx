'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, Copy, MapPin, Search, Trash2 } from 'lucide-react'
import { RoamlyAppShell } from '@/components/roamly-app-shell'
import { EmptyState, RoamlyCard, RoamlySkeleton, Toast } from '@/components/roamly-ui'
import { Button } from '@/components/ui/button'
import { useSavedTrips } from '@/hooks/useSavedTrips'
import { tripStore } from '@/lib/storage/appStore'
import type { TripSummary } from '@/lib/storage/tripStore'
import { newId, type Trip } from '@/lib/state/tripModel'

/** My Trips: every trip saved on this device, with search, duplicate and delete (with Undo). */
export function MyTrips() {
  const { state, reload } = useSavedTrips()
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = (message: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, undo })
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  const trips = state.status === 'ready' ? state.trips : []
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return trips
    return trips.filter((t) => [t.title, t.destination, t.text].some((field) => field.toLowerCase().includes(q)))
  }, [trips, query])

  const duplicate = async (summary: TripSummary) => {
    const result = await tripStore().get(summary.id)
    if (result.status !== 'ok') return notify("That trip couldn't be read, so it wasn't copied.")
    const now = Date.now()
    const copy: Trip = {
      ...result.trip,
      id: newId('trip'),
      createdAt: now,
      updatedAt: now,
      meta: { ...result.trip.meta, title: `${result.trip.meta.title || 'Untitled trip'} (copy)` },
    }
    await tripStore().save(copy)
    await reload()
    notify('Trip duplicated')
  }

  const remove = async (summary: TripSummary) => {
    // Keep the full record in memory so Undo can put it back exactly as it was.
    const result = await tripStore().get(summary.id)
    await tripStore().remove(summary.id)
    await reload()
    notify(`Deleted "${summary.title}"`, result.status === 'ok' ? async () => {
      await tripStore().save(result.trip)
      await reload()
      setToast(null)
    } : undefined)
  }

  return (
    <RoamlyAppShell>
      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">My trips</h1>
            <p className="mt-1 text-sm text-muted-foreground">Saved on this device. They open offline too.</p>
          </div>
          <Link href="/" className="inline-flex min-h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Plan a new trip</Link>
        </header>

        {state.status === 'ready' && state.quarantined > 0 && (
          <p role="status" className="rounded-xl border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-3 text-sm">
            {state.quarantined} saved {state.quarantined === 1 ? 'trip was' : 'trips were'} damaged and set aside, so {state.quarantined === 1 ? "it isn't" : "they aren't"} listed. Your other trips are fine.
          </p>
        )}

        {trips.length > 0 && (
          <label className="relative block">
            <span className="sr-only">Search trips</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by place or title" className="min-h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
        )}

        {state.status === 'loading' && <div className="flex flex-col gap-3" role="status"><RoamlySkeleton className="h-24" /><RoamlySkeleton className="h-24" /><span className="sr-only">Loading trips…</span></div>}
        {state.status === 'unavailable' && <EmptyState title="Saving isn't available here" description="This browser is blocking storage (often a private window). You can still plan trips; they just won't be kept." />}
        {state.status === 'ready' && trips.length === 0 && (
          <EmptyState title="No saved trips yet" description="Plans are saved automatically as soon as they're ready." action={<Link href="/" className="inline-flex min-h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Plan your first trip</Link>} />
        )}
        {state.status === 'ready' && trips.length > 0 && visible.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No trips match &quot;{query}&quot;.</p>}

        <ul className="flex flex-col gap-3">
          {visible.map((t) => (
            <li key={t.id}>
              <RoamlyCard className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Link href={`/trips/${t.id}`} className="min-w-0 flex-1 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <h2 className="truncate font-semibold">{t.title}</h2>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {t.destination && <span className="inline-flex items-center gap-1"><MapPin size={12} aria-hidden="true" />{t.destination}</span>}
                    <span className="inline-flex items-center gap-1"><CalendarDays size={12} aria-hidden="true" />{t.dayCount} {t.dayCount === 1 ? 'day' : 'days'}</span>
                    <span>Edited {new Date(t.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                  </p>
                </Link>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => void duplicate(t)} aria-label={`Duplicate ${t.title}`}><Copy data-icon="inline-start" aria-hidden="true" />Duplicate</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => void remove(t)} aria-label={`Delete ${t.title}`}><Trash2 data-icon="inline-start" aria-hidden="true" />Delete</Button>
                </div>
              </RoamlyCard>
            </li>
          ))}
        </ul>

        {toast && (
          <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 lg:bottom-8">
            <Toast message={toast.message} showUndo={Boolean(toast.undo)} onUndo={() => void toast.undo?.()} onDismiss={() => setToast(null)} />
          </div>
        )}
      </div>
    </RoamlyAppShell>
  )
}
