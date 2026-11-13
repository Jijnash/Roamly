'use client'

import { useState, type FormEvent } from 'react'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CalendarDays, ChevronDown, MapPin, RefreshCw, Trash2 } from 'lucide-react'
import { RoamlyCard } from '@/components/roamly-ui'
import { Button } from '@/components/ui/button'
import type { TripAction } from '@/lib/state/tripReducer'
import type { TripDay } from '@/lib/state/tripModel'
import { StopRow } from '@/components/planner/stop-row'
import type { AiEditState, AlternativesResult } from '@/components/trip-provider'
import { LIMITS } from '@/lib/limits'

type Props = {
  day: TripDay
  dayIndex: number
  allDays: TripDay[]
  destination: string
  locked: boolean
  expandedStops: Set<string>
  onToggleExpanded: (stopId: string) => void
  dispatch: (action: TripAction) => void
  notify: (message: string, undoable?: boolean) => void
  online: boolean
  /** The AI edit running on (or just failed for) this day, if any. */
  edit: AiEditState | null
  onRegenerate: (note?: string) => void
  onCancelEdit: () => void
  fetchAlternatives: (stopId: string) => Promise<AlternativesResult>
}

export function dayLabel(day: TripDay, index: number): string {
  return day.title ? `Day ${index + 1} · ${day.title}` : `Day ${index + 1}`
}

export function DayCard({ day, dayIndex, allDays, destination, locked, expandedStops, onToggleExpanded, dispatch, notify, online, edit, onRegenerate, onCancelEdit, fetchAlternatives }: Props) {
  const [open, setOpen] = useState(true)
  const [asking, setAsking] = useState(false) // the "Rewrite this day" note form is open
  const [note, setNote] = useState('')
  const rewriting = edit?.phase === 'working'
  const submitRewrite = (e: FormEvent) => {
    e.preventDefault()
    setAsking(false)
    onRegenerate(note.trim() || undefined)
    setNote('')
  }
  const done = day.stops.filter((s) => s.done).length
  const label = dayLabel(day, dayIndex)

  // Drag only starts after 6px of movement, so a tap on the handle isn't a drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const toIndex = day.stops.findIndex((s) => s.id === over.id)
    dispatch({ type: 'MOVE_STOP', dayId: day.id, stopId: String(active.id), toIndex })
    notify('Stop moved', true)
  }

  // Screen-reader messages for drag and drop, using stop names instead of internal ids.
  const nameOf = (id: string | number) => day.stops.find((s) => s.id === id)?.name ?? 'stop'
  const positionOf = (id: string | number) => day.stops.findIndex((s) => s.id === id) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}. Use the arrow keys to move it, Space to drop, Escape to cancel.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} is over position ${positionOf(over.id)} of ${day.stops.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)}.` : `${nameOf(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${nameOf(active.id)} was cancelled.`,
  }

  const otherDays = allDays.filter((d) => d.id !== day.id).map((d) => ({ id: d.id, label: dayLabel(d, allDays.indexOf(d)) }))

  return (
    // Each new day fades and slides in as it streams; reduced-motion users get no animation.
    <RoamlyCard className="overflow-hidden p-0 animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none" aria-label={label}>
      <div className="flex items-start gap-3 p-4 sm:p-5">
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><CalendarDays size={17} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold">{label}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{day.stops.length} {day.stops.length === 1 ? 'stop' : 'stops'}</span>
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground">
              {day.stayArea && <><MapPin size={12} aria-hidden="true" />{day.stayArea}<span className="mx-1">·</span></>}
              {done}/{day.stops.length} done
            </span>
            <span className="mt-2 block h-1.5 max-w-44 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <span className="block h-full rounded-full bg-primary transition-all motion-reduce:transition-none" style={{ width: `${day.stops.length ? (done / day.stops.length) * 100 : 0}%` }} />
            </span>
          </span>
          <ChevronDown size={17} className={`mt-2 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
        </button>
        <Button
          variant="ghost"
          size="icon"
          disabled={locked || !online}
          aria-label={`Rewrite ${label} with AI`}
          title={online ? 'Rewrite this day with AI' : 'Needs a connection'}
          aria-expanded={asking}
          className="text-muted-foreground hover:text-primary"
          onClick={() => setAsking((v) => !v)}
        >
          <RefreshCw aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={locked}
          aria-label={`Remove ${label}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => { dispatch({ type: 'REMOVE_DAY', dayId: day.id }); notify('Day removed', true) }}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

      {asking && !rewriting && (
        <form onSubmit={submitRewrite} className="flex flex-col gap-2 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <label htmlFor={`rewrite-${day.id}`} className="sr-only">What should change on this day? (optional)</label>
          <input id={`rewrite-${day.id}`} autoFocus value={note} maxLength={LIMITS.instructionChars} onChange={(e) => setNote(e.target.value)} placeholder="Optional: e.g. more food, start later" className="min-h-9 flex-1 rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <div className="flex gap-2">
            <Button type="submit" size="sm">Rewrite day</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>Cancel</Button>
          </div>
        </form>
      )}
      {rewriting && (
        <div role="status" className="flex items-center justify-between gap-3 border-t bg-primary/5 px-4 py-3 text-sm sm:px-5">
          <span className="flex items-center gap-2"><RefreshCw size={15} className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />Rewriting this day…</span>
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
        </div>
      )}
      {edit?.phase === 'error' && edit.error && (
        <p role="alert" className="border-t px-4 py-3 text-sm text-destructive sm:px-5">
          {edit.error.message} This day was not changed. <span className="text-xs text-muted-foreground">Ref {edit.error.requestId}</span>
        </p>
      )}

      {open && (
        <div className={`border-t px-3 pb-3 sm:px-4 sm:pb-4 ${rewriting ? 'opacity-50' : ''}`}>
          {day.stops.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">No stops left on this day. Undo to bring them back, or remove the day.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} accessibility={{ announcements }}>
              <SortableContext items={day.stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                {day.stops.map((stop, index) => (
                  <StopRow
                    key={stop.id}
                    stop={stop}
                    index={index}
                    day={day}
                    dayNumber={dayIndex + 1}
                    otherDays={otherDays}
                    destination={destination}
                    expanded={expandedStops.has(stop.id)}
                    locked={locked}
                    onExpand={() => onToggleExpanded(stop.id)}
                    onToggleDone={() => dispatch({ type: 'TOGGLE_DONE', dayId: day.id, stopId: stop.id })}
                    onMove={(toIndex) => { dispatch({ type: 'MOVE_STOP', dayId: day.id, stopId: stop.id, toIndex }); notify('Stop moved', true) }}
                    onMoveToDay={(toDayId) => { dispatch({ type: 'MOVE_STOP_TO_DAY', stopId: stop.id, toDayId }); notify('Stop moved to another day', true) }}
                    onEdit={(changes) => { dispatch({ type: 'EDIT_STOP', dayId: day.id, stopId: stop.id, changes }); notify('Stop updated', true) }}
                    onRemove={() => { dispatch({ type: 'REMOVE_STOP', dayId: day.id, stopId: stop.id }); notify('Stop removed', true) }}
                    online={online}
                    fetchAlternatives={() => fetchAlternatives(stop.id)}
                    onReplace={(replacement) => { dispatch({ type: 'REPLACE_STOP', dayId: day.id, stopId: stop.id, stop: replacement }); notify(`Swapped in ${replacement.name}`, true) }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      )}
    </RoamlyCard>
  )
}
