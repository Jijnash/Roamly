'use client'

import { useEffect, useRef, useState } from 'react'
import { Info, LoaderCircle, Minus, Plus, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RoamlySkeleton } from '@/components/roamly-ui'
import { cn } from '@/lib/utils'
import { postJson } from '@/lib/api'
import { createRequestGate } from '@/lib/requestGate'
import { DEFAULT_QUESTIONS, normalizeIntake, type Intake, type IntakeQuestion } from '@/lib/contracts/intake'
import { ModelOutputError } from '@/lib/contracts/plan'
import { isObject } from '@/lib/contracts/clean'
import { useOnline } from '@/hooks/useOnline'

const KNOWN_LABELS: Record<string, string> = {
  destination: 'Destination', days: 'Days', travellers: 'Travellers', budget: 'Budget', origin: 'From', month: 'When', dates: 'Dates',
}

type Phase = { status: 'loading' } | { status: 'ready'; intake: Intake; fallback: boolean }

function IntakeLoading() {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-5 py-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground"><LoaderCircle size={16} className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" /> Reading your trip idea…</div>
      <div className="grid gap-4 sm:grid-cols-2"><RoamlySkeleton className="h-[72px]" /><RoamlySkeleton className="h-[72px]" /><RoamlySkeleton className="h-[72px] sm:col-span-2" /></div>
    </div>
  )
}

/**
 * Intake: the AI reads the trip text, shows what it understood (removable chips),
 * and asks only what's missing. If that call fails or we're offline, a fixed set of
 * basic questions is used instead, so planning is never blocked by intake.
 */
export function IntakeDialog({ prompt, onClose, onBuild }: { prompt: string; onClose: () => void; onBuild: (answers: Record<string, string>) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const online = useOnline()
  const [phase, setPhase] = useState<Phase>({ status: 'loading' })
  const [known, setKnown] = useState<Record<string, string>>({})
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})

  useEffect(() => {
    const dialog = dialogRef.current
    dialog?.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [])

  useEffect(() => {
    const gate = createRequestGate()
    const ticket = gate.begin()
    const useFallback = () => setPhase({ status: 'ready', intake: { known: {}, questions: DEFAULT_QUESTIONS }, fallback: true })
    void postJson('/api/intake', { text: prompt }, ticket.signal).then((result) => {
      if (!ticket.isCurrent()) return
      if (!result.ok) return useFallback()
      try {
        // Validate on the client too, then start every question at its default.
        const { value } = normalizeIntake(isObject(result.body) ? result.body : null)
        setKnown(value.known)
        setAnswers(Object.fromEntries(value.questions.filter((q) => q.default).map((q) => [q.id, q.default!])))
        setPhase({ status: 'ready', intake: value, fallback: false })
      } catch (err) {
        if (!(err instanceof ModelOutputError)) throw err
        useFallback()
      }
    })
    return () => gate.cancel() // dialog closed before the answer came back
  }, [prompt])

  const setAnswer = (id: string, value: string | string[]) => setAnswers((a) => ({ ...a, [id]: value }))

  /** Known facts + answered questions → plain strings for the planner. Empty answers are left out. */
  const collect = (): Record<string, string> => {
    const out: Record<string, string> = { ...known }
    if (phase.status !== 'ready') return out
    for (const q of phase.intake.questions) {
      const value = answers[q.id]
      const text = Array.isArray(value) ? value.join(', ') : (value ?? '').trim()
      if (text) out[q.label.replace(/\?$/, '')] = text
    }
    return out
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="intake-title"
      aria-describedby="intake-description"
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose() }}
      className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[94dvh] w-full max-w-none overflow-hidden rounded-t-3xl border bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/60 sm:inset-0 sm:m-auto sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-3xl"
    >
      <div className="flex max-h-[inherit] flex-col">
        <header className="flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Almost there</p>
            <h2 id="intake-title" className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">A few quick questions</h2>
            <p id="intake-description" className="mt-1 text-sm text-muted-foreground">Only what your description didn&apos;t already say. All optional.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close questions" onClick={onClose}><X aria-hidden="true" /></Button>
        </header>

        {phase.status === 'loading' ? (
          <div className="px-5 py-5 sm:px-7"><IntakeLoading /></div>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); onBuild(collect()) }} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-4 sm:px-7">
              {phase.fallback && (
                <p role="status" className="mb-4 flex items-start gap-2 rounded-xl border bg-muted/50 p-3 text-xs text-muted-foreground">
                  <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  {online ? "Couldn't load tailored questions, so here are the basics." : "You're offline, so here are the basics."}
                </p>
              )}

              {Object.keys(known).length > 0 && (
                <section aria-labelledby="known-heading" className="mb-5">
                  <h3 id="known-heading" className="text-sm font-semibold">Here&apos;s what we understood</h3>
                  <p className="mb-2 text-xs text-muted-foreground">Remove anything we got wrong.</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(known).map(([key, value]) => (
                      <Button key={key} type="button" variant="secondary" size="sm" className="rounded-full" aria-label={`Remove ${KNOWN_LABELS[key] ?? key}: ${value}`}
                        onClick={() => setKnown(({ [key]: _removed, ...rest }) => rest)}>
                        <span className="text-muted-foreground">{KNOWN_LABELS[key] ?? key}:</span> {value}<X data-icon="inline-end" aria-hidden="true" />
                      </Button>
                    ))}
                  </div>
                </section>
              )}

              {phase.intake.questions.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing else needed. Your description covers it.</p>
              ) : (
                <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
                  {phase.intake.questions.map((q) => <QuestionField key={q.id} question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />)}
                </div>
              )}
            </div>
            <footer className="flex shrink-0 flex-col-reverse gap-2 border-t bg-background/95 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 sm:flex-row sm:items-center sm:justify-between sm:px-7">
              <Button type="button" variant="ghost" onClick={() => onBuild({})}>Skip, just plan it</Button>
              <Button type="submit" size="lg" className="w-full sm:w-auto">Build my plan<Sparkles data-icon="inline-end" aria-hidden="true" /></Button>
            </footer>
          </form>
        )}
      </div>
    </dialog>
  )
}

const chip = 'flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium text-muted-foreground transition hover:bg-muted focus-within:ring-2 focus-within:ring-ring'
const chipOn = 'border-primary bg-primary/10 text-primary'

/** One question, drawn according to its type. */
function QuestionField({ question: q, value, onChange }: { question: IntakeQuestion; value: string | string[] | undefined; onChange: (v: string | string[]) => void }) {
  const inputId = `q-${q.id}`
  if (q.type === 'chips' || q.type === 'multi') {
    const selected = Array.isArray(value) ? value : value ? [value] : []
    const toggle = (option: string) => {
      if (q.type === 'chips') onChange(selected[0] === option ? '' : option)
      else onChange(selected.includes(option) ? selected.filter((o) => o !== option) : [...selected, option])
    }
    return (
      <fieldset className="sm:col-span-2">
        <legend className="mb-2 text-sm font-semibold">{q.label}</legend>
        <div className="flex flex-wrap gap-2">
          {q.options.map((option) => {
            const on = selected.includes(option)
            return (
              <label key={option} className={cn(chip, on && chipOn)}>
                <input type={q.type === 'chips' ? 'radio' : 'checkbox'} name={inputId} className="sr-only" checked={on} onChange={() => toggle(option)} onClick={() => q.type === 'chips' && on && toggle(option)} />
                {option}
              </label>
            )
          })}
        </div>
      </fieldset>
    )
  }
  if (q.type === 'number') {
    const n = Math.max(1, Math.min(30, Number(value) || 1))
    return (
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">{q.label}</legend>
        <div className="flex h-10 items-center gap-3">
          <Button type="button" variant="outline" size="icon" aria-label={`Decrease: ${q.label}`} disabled={n <= 1} onClick={() => onChange(String(n - 1))}><Minus aria-hidden="true" /></Button>
          <input id={inputId} aria-label={q.label} type="number" min={1} max={30} value={value ?? ''} onChange={(e) => onChange(e.target.value)} className="h-10 w-20 rounded-lg border bg-background text-center text-sm font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button type="button" variant="outline" size="icon" aria-label={`Increase: ${q.label}`} disabled={n >= 30} onClick={() => onChange(String(n + 1))}><Plus aria-hidden="true" /></Button>
        </div>
      </fieldset>
    )
  }
  return (
    <div>
      <label htmlFor={inputId} className="mb-2 block text-sm font-semibold">{q.label}</label>
      <input id={inputId} type="text" maxLength={60} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
    </div>
  )
}
