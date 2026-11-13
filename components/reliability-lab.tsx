'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bug, FlaskConical, Play, WifiOff } from 'lucide-react'
import { RoamlyAppShell } from '@/components/roamly-app-shell'
import { RoamlyCard } from '@/components/roamly-ui'
import { Button } from '@/components/ui/button'
import { useTrip } from '@/components/trip-provider'
import type { ChaosTrigger } from '@/lib/chaos'
import { setCrashNextDayCard } from '@/lib/devFlags'
import type { TripInput } from '@/lib/state/tripModel'
import { useOnline } from '@/hooks/useOnline'

/**
 * Reliability lab: break the app on purpose. Each "Run" sends a real request
 * through /api/plan with the mock provider forced into one failure mode, so
 * reviewers can see every case in docs/RELIABILITY.md without an API key or quota.
 */

const DEMO_TRIP: TripInput = { text: '3 days in Goa with friends', style: 'local', pace: 'balanced', interests: ['food', 'beaches'], answers: {} }

const SCENARIOS: { trigger: ChaosTrigger; title: string; expect: string }[] = [
  { trigger: 'malformed', title: 'Malformed JSON', expect: 'Chatter, a code fence, a trailing comma and a day cut mid-line. You get the plan, minus the broken day, and a "We fixed 2 problems" note.' },
  { trigger: 'garbage', title: 'No JSON at all', expect: 'The AI answers in prose. You see "Trying once more…", then the strict retry succeeds.' },
  { trigger: 'wrong-shape', title: 'Wrong shape', expect: 'Different key names ("itinerary", "place", "at"). The validators map them, and you get a 2-day plan.' },
  { trigger: 'empty', title: 'Empty answer', expect: 'One retry, then "We couldn\'t plan this trip" with Try again (which works).' },
  { trigger: 'slow', title: 'Slow model', expect: '"Taking longer than usual…" after 8 s of silence. Cancel keeps the days so far; Continue finishes.' },
  { trigger: 'fail', title: 'Provider failure', expect: 'An error card with a reference ID. Try again runs normally and works.' },
  { trigger: 'ratelimit', title: 'Rate limited', expect: '"Roamly is busy right now" with Try again.' },
  { trigger: 'cutoff', title: 'Stream cut off', expect: 'Day 1 is kept and you see "Plan incomplete · Continue". Continue fetches only the missing days.' },
]

export function ReliabilityLab() {
  const router = useRouter()
  const online = useOnline()
  const { trip, stream, startPlan } = useTrip()
  const [provider, setProvider] = useState<string | null>(null)

  useEffect(() => {
    // Which provider normal (non-lab) requests use. Lab runs always use the mock.
    fetch('/api/health')
      .then((res) => res.json())
      .then((body) => setProvider(typeof body.provider === 'string' ? body.provider : null))
      .catch(() => setProvider(null))
  }, [])

  const run = (chaos?: ChaosTrigger) => {
    const id = startPlan(DEMO_TRIP, { chaos })
    router.push(`/trips/${id}`)
  }

  const crashCard = () => {
    setCrashNextDayCard(true)
    const id = trip && trip.days.length > 0 ? trip.id : startPlan(DEMO_TRIP)
    router.push(`/trips/${id}`)
  }

  /** Stale-response demo: a slow request, then a fast one right after. Only the second may show. */
  const rapidResubmit = () => {
    startPlan({ ...DEMO_TRIP, text: 'OLD request: 5 days in Goa' }, { chaos: 'slow' })
    setTimeout(() => {
      const id = startPlan({ ...DEMO_TRIP, text: 'NEW request: 2 days in Goa' })
      router.push(`/trips/${id}`)
    }, 300)
  }

  const ms = (from: number | null, to: number | null) => (from && to ? `${((to - from) / 1000).toFixed(1)} s` : '—')

  return (
    <RoamlyAppShell>
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary"><FlaskConical size={14} aria-hidden="true" />Developer tools</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Reliability lab</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Break Roamly on purpose. Each run sends a real request through the server, with the mock provider forced into one failure mode,
            so no API quota is used. Every case is listed with its test in <span className="font-mono text-xs">docs/RELIABILITY.md</span>.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Normal requests use: <span className="font-semibold text-foreground">{provider ?? '…'}</span></p>
        </header>

        <section aria-labelledby="ai-failures">
          <h2 id="ai-failures" className="mb-3 text-lg font-semibold">Bad AI output</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SCENARIOS.map((s) => (
              <RoamlyCard key={s.trigger} className="flex flex-col gap-3 p-4">
                <div>
                  <h3 className="font-semibold">{s.title} <span className="ml-1 font-mono text-xs text-muted-foreground">[{s.trigger}]</span></h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.expect}</p>
                </div>
                <Button size="sm" variant="outline" className="self-start" disabled={!online} onClick={() => run(s.trigger)}>
                  <Play data-icon="inline-start" aria-hidden="true" />Run
                </Button>
              </RoamlyCard>
            ))}
          </div>
        </section>

        <section aria-labelledby="app-failures">
          <h2 id="app-failures" className="mb-3 text-lg font-semibold">App behaviour</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <RoamlyCard className="flex flex-col gap-3 p-4">
              <div>
                <h3 className="font-semibold">Stale response</h3>
                <p className="mt-1 text-sm text-muted-foreground">Sends a slow &quot;OLD&quot; request, then a &quot;NEW&quot; one 0.3 s later. The old one is aborted and its late events are ignored, so you only ever see the 2-day NEW plan.</p>
              </div>
              <Button size="sm" variant="outline" className="self-start" disabled={!online} onClick={rapidResubmit}><Play data-icon="inline-start" aria-hidden="true" />Run</Button>
            </RoamlyCard>
            <RoamlyCard className="flex flex-col gap-3 p-4">
              <div>
                <h3 className="font-semibold">Crash a card</h3>
                <p className="mt-1 text-sm text-muted-foreground">Day 1 throws while rendering. Its error boundary shows &quot;This day couldn&apos;t be shown&quot;; the other days keep working. &quot;Reload this section&quot; brings it back.</p>
              </div>
              <Button size="sm" variant="outline" className="self-start" onClick={crashCard}><Bug data-icon="inline-start" aria-hidden="true" />Crash day 1</Button>
            </RoamlyCard>
            <RoamlyCard className="flex flex-col gap-2 p-4 sm:col-span-2">
              <h3 className="flex items-center gap-2 font-semibold"><WifiOff size={16} aria-hidden="true" />Offline</h3>
              <p className="text-sm text-muted-foreground">
                Turn off Wi-Fi, or in browser DevTools set Network to &quot;Offline&quot;. An offline banner appears, AI buttons are disabled with the reason,
                and your current plan stays fully editable.
              </p>
            </RoamlyCard>
          </div>
        </section>

        <section aria-labelledby="last-request">
          <h2 id="last-request" className="mb-3 text-lg font-semibold">Last plan request</h2>
          <RoamlyCard className="p-4">
            {stream.phase === 'idle' ? (
              <p className="text-sm text-muted-foreground">No request yet in this session.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                <Metric label="Status" value={stream.phase === 'done' && !stream.complete ? 'incomplete' : stream.phase} />
                <Metric label="Provider" value={stream.provider ?? '—'} />
                <Metric label="Request ID" value={stream.requestId ?? '—'} mono />
                <Metric label="First day after" value={ms(stream.startedAt, stream.firstDayAt)} />
                <Metric label="Total time" value={ms(stream.startedAt, stream.finishedAt)} />
                <Metric label="Warnings" value={String(stream.warningCount)} />
                {stream.error && <Metric label="Error" value={`${stream.error.code}: ${stream.error.message}`} wide />}
              </dl>
            )}
          </RoamlyCard>
        </section>
      </div>
    </RoamlyAppShell>
  )
}

function Metric({ label, value, mono, wide }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-full' : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
