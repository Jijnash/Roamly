'use client'

import Link from 'next/link'

/**
 * Page-level fallback: catches anything a section boundary didn't.
 * The trip lives in the root layout's provider, which this does not wrap,
 * so "Try again" re-renders the page with the trip still in memory.
 */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error && 'digest' in error ? String((error as Error & { digest?: string }).digest ?? '') : ''
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
      <p className="text-sm text-muted-foreground">Your trip is still here. Try again, or go back to the start.</p>
      {digest && <p className="text-xs text-muted-foreground">Reference: <span className="font-mono">{digest}</span></p>}
      <div className="flex gap-2">
        <button onClick={() => retry()} className="min-h-9 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">Try again</button>
        <Link href="/" className="inline-flex min-h-9 items-center rounded-lg border px-4 text-sm font-medium">Home</Link>
      </div>
    </div>
  )
}
