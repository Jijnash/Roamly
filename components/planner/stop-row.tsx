'use client'

import { useState, type FormEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, ChevronRight, GripVertical, MapPinned, Pencil, Shuffle, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LIMITS } from '@/lib/limits'
import { googleMapsSearchUrl } from '@/lib/deeplinks'
import type { StopEdit } from '@/lib/state/tripReducer'
import type { TripDay, TripStop } from '@/lib/state/tripModel'
import type { Stop } from '@/lib/contracts/types'
import type { AlternativesResult } from '@/components/trip-provider'
import { categoryIcon, categoryIconStyle, categoryLabel } from '@/components/planner/category'

type Props = {
  stop: TripStop
  index: number
  day: TripDay
  dayNumber: number
  otherDays: { id: string; label: string }[]
  destination: string
  expanded: boolean
  locked: boolean
  onExpand: () => void
  onToggleDone: () => void
  onMove: (toIndex: number) => void
  onMoveToDay: (dayId: string) => void
  onEdit: (changes: StopEdit) => void
  onRemove: () => void
  online: boolean
  fetchAlternatives: () => Promise<AlternativesResult>
  onReplace: (stop: Stop) => void
}

type SwapState = { phase: 'closed' } | { phase: 'loading' } | { phase: 'ready'; stops: Stop[] } | { phase: 'error'; message: string }

/**
 * One stop. The grip button is the drag handle (mouse, touch, and keyboard: focus it,
 * press Space, move with arrow keys, Space again to drop). The ↑/↓ buttons do the
 * same without dragging.
 */
export function StopRow({ stop, index, day, dayNumber, otherDays, destination, expanded, locked, onExpand, onToggleDone, onMove, onMoveToDay, onEdit, onRemove, online, fetchAlternatives, onReplace }: Props) {
  const [editing, setEditing] = useState(false)
  const [swap, setSwap] = useState<SwapState>({ phase: 'closed' })

  const loadAlternatives = async () => {
    setSwap({ phase: 'loading' })
    const result = await fetchAlternatives()
    if (result.ok) setSwap({ phase: 'ready', stops: result.stops })
    else if (result.error) setSwap({ phase: 'error', message: result.error.message })
    else setSwap({ phase: 'closed' }) // cancelled by a newer request
  }
  // Dragging is off while a stop is expanded: dnd-kit misplaces one very tall item among short ones
  // (found in testing), and the expanded panel has Move up / Move down buttons instead.
  const dragDisabled = locked || expanded
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id, disabled: dragDisabled })
  const Icon = categoryIcon[stop.category]
  const mapsUrl = googleMapsSearchUrl(stop.name, destination)
  const headingId = `stop-${stop.id}`

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`border-b bg-card last:border-b-0 ${isDragging ? 'relative z-10 rounded-xl shadow-lg ring-2 ring-primary/40' : ''}`}
      aria-labelledby={headingId}
    >
      <div className="flex items-center gap-1.5 py-3 sm:gap-3">
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          disabled={dragDisabled}
          aria-label={`Drag to reorder ${stop.name}`}
          title={expanded ? 'Collapse the stop to drag it, or use Move up / Move down' : undefined}
          className="flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40"
        >
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <span className="w-11 shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground sm:w-12">{stop.time || '—'}</span>
        {/* Hidden on narrow phones so the stop name gets the room; the category is still in the screen-reader text below. */}
        <span className={`hidden size-9 shrink-0 items-center justify-center rounded-xl min-[400px]:flex ${categoryIconStyle[stop.category]}`} title={categoryLabel[stop.category]}>
          <Icon size={16} aria-hidden="true" />
        </span>
        <span className="sr-only">{categoryLabel[stop.category]}:</span>
        <button type="button" onClick={onExpand} aria-expanded={expanded} className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span id={headingId} className={`line-clamp-2 block text-sm font-semibold ${stop.done ? 'text-muted-foreground line-through' : ''}`}>{stop.name}</span>
          {stop.duration && <span className="mt-0.5 block text-xs text-muted-foreground">{stop.duration}</span>}
        </button>
        <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg hover:bg-muted">
          <input type="checkbox" aria-label={`Mark ${stop.name} as done`} checked={stop.done} disabled={locked} onChange={onToggleDone} className="size-4 accent-primary" />
        </label>
        <button type="button" aria-label={`${expanded ? 'Collapse' : 'Expand'} ${stop.name}`} aria-expanded={expanded} onClick={onExpand} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <ChevronRight size={17} className={`transition-transform motion-reduce:transition-none ${expanded ? 'rotate-90' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {expanded && (
        <div className="mb-3 rounded-xl bg-muted/50 p-3 sm:ml-[7.5rem] sm:p-4">
          {editing ? (
            <EditStopForm stop={stop} onCancel={() => setEditing(false)} onSave={(changes) => { onEdit(changes); setEditing(false) }} />
          ) : (
            <>
              {stop.description && <p className="text-sm leading-6 text-muted-foreground">{stop.description}</p>}
              {stop.tip && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#F59E0B]/25 bg-[#F59E0B]/10 p-3 text-xs leading-5">
                  <Sparkles size={15} className="mt-0.5 shrink-0 text-[#B45309] dark:text-[#FCD34D]" aria-hidden="true" />
                  <p><span className="font-semibold">Tip</span> · {stop.tip}</p>
                </div>
              )}
              {mapsUrl && (
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline">
                  <MapPinned size={14} aria-hidden="true" />Open in Google Maps
                </a>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3">
                <Button variant="outline" size="sm" disabled={locked || index === 0} onClick={() => onMove(index - 1)}><ArrowUp data-icon="inline-start" aria-hidden="true" />Move up</Button>
                <Button variant="outline" size="sm" disabled={locked || index === day.stops.length - 1} onClick={() => onMove(index + 1)}><ArrowDown data-icon="inline-start" aria-hidden="true" />Move down</Button>
                {otherDays.length > 0 && (
                  <>
                    <label className="sr-only" htmlFor={`move-${stop.id}`}>Move {stop.name} to another day</label>
                    <select id={`move-${stop.id}`} value="" disabled={locked} onChange={(e) => e.target.value && onMoveToDay(e.target.value)} className="min-h-9 max-w-[160px] rounded-lg border bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
                      <option value="">Move to day…</option>
                      {otherDays.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                    </select>
                  </>
                )}
                <Button variant="ghost" size="sm" disabled={locked || !online || swap.phase === 'loading'} onClick={() => void loadAlternatives()}><Shuffle data-icon="inline-start" aria-hidden="true" />Swap with AI</Button>
                <Button variant="ghost" size="sm" disabled={locked} onClick={() => setEditing(true)}><Pencil data-icon="inline-start" aria-hidden="true" />Edit</Button>
                <Button variant="ghost" size="sm" disabled={locked} className="text-destructive hover:text-destructive" onClick={onRemove} aria-label={`Remove ${stop.name} from day ${dayNumber}`}>
                  <Trash2 data-icon="inline-start" aria-hidden="true" />Remove
                </Button>
              </div>
              <SwapPanel swap={swap} locked={locked} onPick={(alt) => { onReplace(alt); setSwap({ phase: 'closed' }) }} onRetry={() => void loadAlternatives()} onClose={() => setSwap({ phase: 'closed' })} />
            </>
          )}
        </div>
      )}
    </article>
  )
}

/** The 3 AI suggestions for "Swap with AI". Nothing changes until one is picked (and that can be undone). */
function SwapPanel({ swap, locked, onPick, onRetry, onClose }: { swap: SwapState; locked: boolean; onPick: (stop: Stop) => void; onRetry: () => void; onClose: () => void }) {
  if (swap.phase === 'closed') return null
  if (swap.phase === 'loading') {
    return <p role="status" className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Shuffle size={14} className="animate-pulse motion-reduce:animate-none" aria-hidden="true" />Finding alternatives…</p>
  }
  if (swap.phase === 'error') {
    return (
      <div role="alert" className="mt-3 flex flex-wrap items-center gap-2 text-xs text-destructive">
        {swap.message}
        <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-lg border bg-background p-2">
      <p className="px-1 pb-1 text-xs font-medium text-muted-foreground">Pick a replacement</p>
      <ul className="flex flex-col gap-1">
        {swap.stops.map((alt) => (
          <li key={alt.name} className="flex items-start gap-2 rounded-lg p-2 hover:bg-muted">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{alt.name} <span className="text-xs font-normal text-muted-foreground">{[alt.time, alt.duration, categoryLabel[alt.category]].filter(Boolean).join(' · ')}</span></p>
              {alt.description && <p className="mt-0.5 text-xs text-muted-foreground">{alt.description}</p>}
            </div>
            <Button size="sm" variant="outline" disabled={locked} onClick={() => onPick(alt)} aria-label={`Use ${alt.name} instead`}>Use</Button>
          </li>
        ))}
      </ul>
      <Button size="sm" variant="ghost" className="mt-1" onClick={onClose}>Keep the current stop</Button>
    </div>
  )
}

function EditStopForm({ stop, onSave, onCancel }: { stop: TripStop; onSave: (changes: StopEdit) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: stop.name, time: stop.time, duration: stop.duration, description: stop.description, tip: stop.tip })
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (form.name.trim()) onSave(form)
  }
  const field = 'mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" aria-label={`Edit ${stop.name}`}>
      <label className="text-xs font-medium sm:col-span-2">Name<input required autoFocus maxLength={LIMITS.nameChars} value={form.name} onChange={set('name')} className={field} /></label>
      <label className="text-xs font-medium">Time<input type="time" value={form.time} onChange={set('time')} className={field} /></label>
      <label className="text-xs font-medium">Duration<input maxLength={LIMITS.shortChars} value={form.duration} onChange={set('duration')} placeholder="e.g. 1h 30m" className={field} /></label>
      <label className="text-xs font-medium sm:col-span-2">Description<textarea rows={3} maxLength={LIMITS.descriptionChars} value={form.description} onChange={set('description')} className={field} /></label>
      <label className="text-xs font-medium sm:col-span-2">Tip<input maxLength={LIMITS.tipChars} value={form.tip} onChange={set('tip')} className={field} /></label>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" size="sm" disabled={!form.name.trim()}>Save</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}
