'use client'

import { catchError, type ErrorInfo } from 'next/error'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { setCrashNextDayCard } from '@/lib/devFlags'

/**
 * Error boundary for one part of a page (a day card, the sidebar…).
 * If that part throws while rendering, only it is replaced by this message;
 * the rest of the page keeps working and the trip data is untouched.
 *
 * Built with Next's catchError (a function-style boundary), so no class component is needed.
 */
function SectionFallback({ name }: { name: string }, { error, retry }: ErrorInfo) {
  const detail = error instanceof Error ? error.message : 'Unknown error'
  return (
    <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 sm:p-5">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 shrink-0 text-destructive" size={20} aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">This {name} couldn&apos;t be shown</h2>
          <p className="mt-1 text-sm text-muted-foreground">The rest of your trip is fine, and nothing was lost.</p>
          <p className="mt-1 text-xs text-muted-foreground">Details: {detail}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setCrashNextDayCard(false) // ends the lab's crash demo, if that's what happened
              retry()
            }}
          >
            <RotateCw data-icon="inline-start" aria-hidden="true" />Reload this section
          </Button>
        </div>
      </div>
    </div>
  )
}

export const SectionBoundary = catchError(SectionFallback)
