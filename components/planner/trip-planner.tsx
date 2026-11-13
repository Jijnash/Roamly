'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { ArrowLeft, CalendarDays, MapPin, RefreshCw, RotateCcw, RotateCw, Send, TriangleAlert } from 'lucide-react'
import { RoamlyAppShell } from '@/components/roamly-app-shell'
import { EmptyState, RoamlySkeleton, Toast } from '@/components/roamly-ui'
import { Button } from '@/components/ui/button'
import { useTrip, type SaveState } from '@/components/trip-provider'
import { DayCard } from '@/components/planner/day-card'
import { SectionBoundary } from '@/components/section-boundary'
import { CrashTest } from '@/lib/devFlags'
import { DaySkeleton, PlanStatus } from '@/components/planner/plan-status'
import { BudgetBlock, PackingBlock, StaysBlock, TipsBlock, TransportBlock, WhyBlock, formatMoney } from '@/components/planner/trip-blocks'
import { LIMITS } from '@/lib/limits'
import { OFFLINE_REASON, useOnline } from '@/hooks/useOnline'

const QUICK_REFINES = ['Cheaper', 'More relaxed', 'More food', 'Kid-friendly', 'Fewer transfers']

type ToastState = { message: string; undoable: boolean; key: number } | null

type LoadStatus = 'loading' | 'ok' | 'missing' | 'corrupt'

export function TripPlanner({ id }: { id: string }) {
  const { trip: currentTrip, canUndo, canRedo, dispatch, stream, aiEdit, busy, retryPlan, continuePlan, cancelPlan, refine, regenerateDay, cancelEdit, fetchAlternatives, saveState, openTrip } = useTrip()
  // Only show the provider's trip if it is the one in the URL; otherwise load it from storage.
  const trip = currentTrip?.id === id ? currentTrip : null
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(trip ? 'ok' : 'loading')
  useEffect(() => {
    let alive = true
    void openTrip(id).then((status) => { if (alive) setLoadStatus(status) })
    return () => { alive = false }
  }, [id, openTrip])
  const online = useOnline()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [refineText, setRefineText] = useState('')
  const [toast, setToast] = useState<ToastState>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const notify = (message: string, undoable = false) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, undoable, key: Date.now() })
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  const undo = () => { if (canUndo && !busy) { dispatch({ type: 'UNDO' }); notify('Change undone') } }
  const redo = () => { if (canRedo && !busy) { dispatch({ type: 'REDO' }); notify('Change restored') } }

  // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl+Y = redo. Ignored while typing, so text fields keep their own undo.
  const undoRef = useRef(undo)
  const redoRef = useRef(redo)
  useEffect(() => { undoRef.current = undo; redoRef.current = redo })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return
      if (!(e.ctrlKey || e.metaKey)) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undoRef.current() }
      else if ((key === 'z' && e.shiftKey) || key === 'y') { e.preventDefault(); redoRef.current() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggleExpanded = (stopId: string) => setExpanded((current) => {
    const next = new Set(current)
    if (next.has(stopId)) next.delete(stopId)
    else next.add(stopId)
    return next
  })

  const submitRefine = async (e: FormEvent) => {
    e.preventDefault()
    const instruction = refineText.trim()
    if (!instruction || busy || !online) return
    if (await refine(instruction)) {
      setRefineText('')
      notify('Plan updated', true)
    }
  }

  if (!trip) {
    const message = loadStatus === 'loading'
      ? null
      : loadStatus === 'corrupt'
        ? { title: "This saved trip couldn't be read", description: 'It looks damaged, so Roamly set it aside instead of showing broken data. Your other trips are fine.' }
        : { title: 'Trip not found', description: "It may have been deleted, or it was saved in a different browser." }
    return (
      <RoamlyAppShell>
        <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
          {message ? (
            <EmptyState
              title={message.title}
              description={message.description}
              action={<div className="flex gap-2"><Link href="/trips" className="inline-flex min-h-9 items-center rounded-lg border px-4 text-sm font-medium">My trips</Link><Link href="/" className="inline-flex min-h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Plan a trip</Link></div>}
            />
          ) : (
            <div role="status" className="flex flex-col gap-3"><RoamlySkeleton className="h-8 w-64" /><RoamlySkeleton className="h-40 w-full" /><span className="sr-only">Loading trip…</span></div>
          )}
        </div>
      </RoamlyAppShell>
    )
  }

  const streaming = stream.phase === 'streaming'
  const totalStops = trip.days.reduce((n, d) => n + d.stops.length, 0)
  const doneStops = trip.days.reduce((n, d) => n + d.stops.filter((s) => s.done).length, 0)
  const budget = trip.info?.budget
  const title = trip.meta.title || (streaming ? 'Planning your trip…' : 'Your trip')

  return (
    <RoamlyAppShell>
      <div className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="min-w-0" aria-labelledby="trip-title" aria-busy={streaming}>
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-3 text-sm">
                  <Link href="/trips" className="inline-flex items-center gap-1 font-medium text-muted-foreground transition hover:text-foreground"><ArrowLeft size={16} aria-hidden="true" /> My trips</Link>
                  <SaveIndicator state={saveState} streaming={streaming} />
                </div>
                <h1 id="trip-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
                {trip.meta.destination && <p className="mt-1.5 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin size={15} className="text-primary" aria-hidden="true" />{trip.meta.destination}</p>}
                {trip.meta.summary && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{trip.meta.summary}</p>}
                {trip.days.length > 0 && <div className="mt-4 flex flex-wrap gap-2" aria-label="Trip summary">
                  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium"><CalendarDays size={14} className="text-primary" aria-hidden="true" />{trip.days.length} {trip.days.length === 1 ? 'day' : 'days'}</span>
                  {budget && <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium">≈ {formatMoney(budget.perPerson, budget.currency)} <span className="text-muted-foreground">/ person, estimate</span></span>}
                  <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border bg-card px-3 text-xs font-medium text-muted-foreground">{doneStops}/{totalStops} done</span>
                </div>}
              </div>
              <div className={`flex items-center gap-1.5 ${trip.days.length === 0 && !canUndo ? 'hidden' : ''}`} aria-label="Edit history">
                <Button variant="ghost" size="icon" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo || busy} onClick={undo}><RotateCcw aria-hidden="true" /></Button>
                <Button variant="ghost" size="icon" aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo || busy} onClick={redo}><RotateCw aria-hidden="true" /></Button>
              </div>
            </div>

            <PlanStatus stream={stream} online={online} dayCount={trip.days.length} onCancel={cancelPlan} onRetry={retryPlan} onContinue={continuePlan} />

            {trip.warnings.length > 0 && (
              <details className="mb-4 rounded-xl border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-3 text-sm">
                <summary className="flex cursor-pointer items-center gap-2 font-semibold">
                  <TriangleAlert size={16} aria-hidden="true" />
                  We fixed {trip.warnings.length} {trip.warnings.length === 1 ? 'problem' : 'problems'} in the AI&apos;s answer
                </summary>
                <ul className="mt-2 list-disc pl-6 text-muted-foreground">{trip.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
              </details>
            )}

            <div className="flex flex-col gap-4">
              {trip.days.map((day, index) => (
                // Each day has its own error boundary: one broken card can't take down the plan.
                <SectionBoundary key={day.id} name="day">
                  {index === 0 && <CrashTest />}
                  <DayCard
                  day={day}
                  dayIndex={index}
                  allDays={trip.days}
                  destination={trip.meta.destination}
                  locked={busy}
                  expandedStops={expanded}
                  onToggleExpanded={toggleExpanded}
                  dispatch={dispatch}
                  notify={notify}
                  online={online}
                  edit={aiEdit.targetId === day.id ? aiEdit : null}
                  onRegenerate={async (note) => { if (await regenerateDay(day.id, note)) notify(`Day ${index + 1} rewritten`, true) }}
                  onCancelEdit={cancelEdit}
                  fetchAlternatives={(stopId) => fetchAlternatives(day.id, stopId)}
                  />
                </SectionBoundary>
              ))}
              {streaming && <DaySkeleton dayNumber={trip.days.length + 1} />}
              {!streaming && trip.days.length === 0 && stream.phase !== 'error' && (
                <EmptyState title="No days in this plan" description="Every day was removed. Undo to bring them back, or plan a new trip." />
              )}
            </div>
          </section>

          {/* Overview blocks: beside the plan on desktop, after it on phones. Each block hides itself when it has no data. */}
          <SectionBoundary name="overview">
            <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto lg:pb-2" aria-label="Trip overview">
              <WhyBlock why={trip.meta.why} />
              <BudgetBlock budget={budget ?? null} />
              <PackingBlock items={trip.info?.packing ?? []} packed={trip.packed} locked={busy} onToggle={(item) => dispatch({ type: 'TOGGLE_PACKED', item })} />
              <TransportBlock legs={trip.transport} />
              <StaysBlock nights={trip.stays} destination={trip.meta.destination} />
              <TipsBlock info={trip.info} />
            </aside>
          </SectionBoundary>
        </div>

        {trip.days.length > 0 && !streaming && (
          <div className="sticky bottom-[5.25rem] z-30 -mx-4 mt-5 border-t bg-background/95 p-3 shadow-[0_-10px_30px_-22px_rgba(15,23,42,.4)] backdrop-blur-xl sm:-mx-6 sm:px-6 sm:py-4 lg:bottom-4 lg:-mx-8 lg:px-8">
            <div className="mx-auto max-w-4xl">
              {aiEdit.phase === 'working' && aiEdit.kind === 'refine' ? (
                <div className="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-card px-4" role="status">
                  <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><RefreshCw size={16} className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />Updating your plan…</p>
                  <Button variant="ghost" size="sm" onClick={cancelEdit}>Cancel</Button>
                </div>
              ) : (
                <>
                  {!online && <p className="mb-2 text-xs text-muted-foreground">{OFFLINE_REASON}</p>}
                  {aiEdit.phase === 'error' && aiEdit.kind === 'refine' && aiEdit.error && (
                    <p role="alert" className="mb-2 text-sm text-destructive">{aiEdit.error.message} Your plan was not changed. <span className="text-xs text-muted-foreground">Ref {aiEdit.error.requestId}</span></p>
                  )}
                  <form className="flex items-center gap-2 rounded-xl border bg-card p-1.5 focus-within:ring-2 focus-within:ring-ring" onSubmit={submitRefine}>
                    <label htmlFor="refine-trip" className="sr-only">Ask for changes to your trip</label>
                    <input id="refine-trip" value={refineText} maxLength={LIMITS.instructionChars} onChange={(e) => setRefineText(e.target.value)} placeholder="Ask for changes… e.g. make day 2 more relaxed" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground" />
                    <Button size="icon" type="submit" aria-label="Send trip changes" title={online ? undefined : OFFLINE_REASON} disabled={!refineText.trim() || busy || !online}><Send size={16} aria-hidden="true" /></Button>
                  </form>
                  <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5" aria-label="Quick changes">
                    {QUICK_REFINES.map((chip) => (
                      <button key={chip} type="button" onClick={() => setRefineText(chip)} className="min-h-8 shrink-0 rounded-full border bg-background px-3 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{chip}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {toast && (
          <div className="fixed bottom-[9.5rem] left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 lg:bottom-24">
            <Toast key={toast.key} message={toast.message} showUndo={toast.undoable && canUndo} onUndo={() => { dispatch({ type: 'UNDO' }); setToast(null) }} onDismiss={() => setToast(null)} />
          </div>
        )}
      </div>
    </RoamlyAppShell>
  )
}

function SaveIndicator({ state, streaming }: { state: SaveState; streaming: boolean }) {
  if (streaming || state === 'idle') return null
  const text = {
    saving: 'Saving…',
    local: 'Saved on this device',
    synced: 'Saved and synced',
    pending: 'Saved on this device · will sync when back online',
    error: "Couldn't save. Changes are kept until you close the tab.",
  }[state]
  return <span role="status" className={`text-xs ${state === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{text}</span>
}
