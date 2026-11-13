'use client'

import { AlertTriangle, CircleHelp, PauseCircle, RotateCw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RoamlySkeleton } from '@/components/roamly-ui'
import type { StreamState } from '@/hooks/usePlanStream'

type Props = {
  stream: StreamState
  /** Retry and Continue need the network; offline they're disabled with the reason shown. */
  online: boolean
  dayCount: number
  onCancel: () => void
  onRetry: () => void
  onContinue: () => void
}

/**
 * Shows where the current AI request stands: generating, retrying, cut off,
 * cancelled or failed, with the action that fits (Cancel, Continue, Retry).
 * Days already received are never thrown away by an error.
 */
export function PlanStatus({ stream, online, dayCount, onCancel, onRetry, onContinue }: Props) {
  const offlineNote = online ? null : <p className="mt-2 text-xs text-muted-foreground">You&apos;re offline. Reconnect to try again.</p>
  if (stream.phase === 'streaming') {
    return (
      <div className="mb-5 rounded-2xl border bg-card p-4 sm:p-5" role="status" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles size={16} className="motion-safe:animate-pulse" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">{dayCount === 0 ? 'Planning your trip…' : `Planning… ${dayCount} ${dayCount === 1 ? 'day' : 'days'} ready`}</p>
              {stream.retryNote && <p className="mt-0.5 text-xs text-muted-foreground">{stream.retryNote}</p>}
              {stream.slow && !stream.retryNote && <p className="mt-0.5 text-xs text-muted-foreground">Taking longer than usual… You can keep waiting or cancel.</p>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    )
  }

  if (stream.phase === 'error' && stream.error) {
    const partial = dayCount > 0
    return (
      <div role="alert" className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 shrink-0 text-destructive" size={20} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{partial ? 'The plan stopped early' : "We couldn't plan this trip"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {stream.error.message}
              {partial && ` Your ${dayCount} ${dayCount === 1 ? 'day is' : 'days are'} kept.`}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">Reference: <span className="font-mono">{stream.error.requestId}</span></p>
            <div className="mt-3 flex flex-wrap gap-2">
              {partial && stream.error.retryable && <Button size="sm" disabled={!online} onClick={onContinue}><RotateCw data-icon="inline-start" aria-hidden="true" />Continue</Button>}
              {stream.error.retryable && <Button size="sm" disabled={!online} variant={partial ? 'outline' : 'default'} onClick={onRetry}>{partial ? 'Start over' : 'Try again'}</Button>}
            </div>
            {offlineNote}
          </div>
        </div>
      </div>
    )
  }

  if ((stream.phase === 'done' && !stream.complete) || stream.phase === 'cancelled') {
    const cancelled = stream.phase === 'cancelled'
    return (
      <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#F59E0B]/35 bg-[#F59E0B]/10 px-4 py-3 text-sm">
        {cancelled ? <PauseCircle size={18} className="shrink-0" aria-hidden="true" /> : <CircleHelp size={18} className="shrink-0" aria-hidden="true" />}
        <p className="flex-1">
          <span className="font-semibold">{cancelled ? 'Stopped.' : 'Plan incomplete.'}</span>{' '}
          {dayCount > 0 ? `${dayCount} ${dayCount === 1 ? 'day' : 'days'} kept.` : 'Nothing was planned yet.'}
        </p>
        {dayCount > 0
          ? <Button size="sm" disabled={!online} onClick={onContinue}>Continue</Button>
          : <Button size="sm" disabled={!online} onClick={onRetry}>Try again</Button>}
      </div>
    )
  }

  return null
}

/** Placeholder card for the day that is still being written. */
export function DaySkeleton({ dayNumber }: { dayNumber: number }) {
  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-5" aria-label={`Day ${dayNumber} is being planned`}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-1 flex-col gap-2"><RoamlySkeleton className="h-5 w-52 max-w-full" /><RoamlySkeleton className="h-3 w-36" /></div>
        <RoamlySkeleton className="size-8 rounded-full" />
      </div>
      <div className="mt-5 flex flex-col gap-3"><RoamlySkeleton className="h-[52px] w-full" /><RoamlySkeleton className="h-[52px] w-full" /></div>
    </div>
  )
}
