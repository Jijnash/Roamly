'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, ChevronRight, LoaderCircle, WifiOff, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export type Category = 'sight' | 'food' | 'activity' | 'transport' | 'stay' | 'other'

const categoryStyles: Record<Category, string> = {
  sight: 'bg-category-sight/10 text-category-sight dark:bg-category-sight/15',
  food: 'bg-category-food/15 text-[#92400E] dark:bg-category-food/10 dark:text-[#FCD34D]',
  activity: 'bg-category-activity/10 text-category-activity dark:bg-category-activity/15',
  transport: 'bg-category-transport/10 text-category-transport dark:bg-category-transport/15',
  stay: 'bg-category-stay/10 text-category-stay dark:bg-category-stay/15',
  other: 'bg-category-other/10 text-category-other dark:bg-category-other/15',
}

export function RoamlyButton({ variant = 'primary', loading = false, children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'destructive'; loading?: boolean }) {
  const variants = { primary: 'bg-primary text-primary-foreground hover:bg-primary/90', secondary: 'border bg-secondary text-secondary-foreground hover:bg-secondary/80', ghost: 'text-foreground hover:bg-muted', destructive: 'bg-destructive text-white hover:bg-destructive/90' }
  return <button {...props} disabled={loading || props.disabled} className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${variants[variant]} ${className}`}>{loading && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{loading ? <><span className="sr-only">Loading</span>{children}</> : children}</button>
}

export function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button {...props} aria-label={label} className={`inline-flex size-10 items-center justify-center rounded-lg border bg-background text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${props.className ?? ''}`}>{children}</button>
}

export function Chip({ children, selected = false, onClick }: { children: React.ReactNode; selected?: boolean; onClick?: () => void }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`min-h-9 rounded-full border px-3.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'border-primary bg-primary/10 text-primary' : 'bg-background text-muted-foreground hover:bg-muted'}`}>{children}</button>
}

// Pass-through props (role, aria-live, id…) so callers can make a card an accessible live region.
export function RoamlyCard({ children, className = '', ...props }: React.HTMLAttributes<HTMLElement>) {
  // cn() (tailwind-merge) lets a caller's "p-0" replace the default "p-5"; plain string joining kept both and p-5 won.
  return <section {...props} className={cn('rounded-2xl border bg-card p-5 text-card-foreground shadow-sm', className)}>{children}</section>
}

export function CategoryBadge({ category }: { category: Category }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${categoryStyles[category]}`}>{category}</span>
}

export function RoamlySkeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-lg bg-muted ${className}`} />
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-5 py-8 text-center"><span className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary"><ChevronRight size={19} aria-hidden="true" /></span><h3 className="font-semibold">{title}</h3><p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>{action && <div className="mt-4">{action}</div>}</div>
}

export function ErrorCard({ title, message, referenceId, onRetry, role = 'alert', ariaLabel }: { title: string; message: string; referenceId: string; onRetry: () => void; role?: 'alert' | 'group'; ariaLabel?: string }) {
  return <div role={role} aria-label={ariaLabel} className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 shrink-0 text-destructive" size={20} aria-hidden="true"/><div className="min-w-0 flex-1"><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm text-muted-foreground">{message}</p><p className="mt-2 text-xs text-muted-foreground">Reference: <code>{referenceId}</code></p><Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>Retry</Button></div></div></div>
}

export function OfflineBanner() {
  return <div role="status" className="flex items-start gap-3 rounded-xl border border-[#F59E0B]/35 bg-[#F59E0B]/10 p-4 text-foreground"><WifiOff size={18} aria-hidden="true"/><p className="text-sm"><strong>You&apos;re offline.</strong> Your plan and edits still work; AI actions come back when you reconnect.</p></div>
}

export function UpdateBanner({ onUpdate }: { onUpdate: () => void }) {
  return <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><p className="text-sm font-medium">A new version of Roamly is ready.</p><Button size="sm" onClick={onUpdate}>Update now</Button></div>
}

export function Toast({ message, onUndo, onDismiss, showUndo = true }: { message: string; onUndo: () => void; onDismiss: () => void; showUndo?: boolean }) {
  return <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border bg-foreground px-4 py-3 text-background shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none"><Check size={17} aria-hidden="true"/><span className="flex-1 text-sm">{message}</span>{showUndo && <button className="rounded px-2 py-1 text-sm font-semibold underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onUndo}>Undo</button>}<button className="rounded p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Dismiss notification" onClick={onDismiss}><X size={15}/></button></div>
}



