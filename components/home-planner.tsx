'use client'

import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, Mic, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState, RoamlyCard } from '@/components/roamly-ui'
import { IntakeDialog } from '@/components/intake-dialog'
import { useTrip } from '@/components/trip-provider'
import { OFFLINE_REASON, useOnline } from '@/hooks/useOnline'
import { useSavedTrips } from '@/hooks/useSavedTrips'
import { cn } from '@/lib/utils'

type SpeechAlternative = { transcript: string }
type SpeechResult = ArrayLike<SpeechAlternative>
type SpeechRecognitionEventLike = { results: ArrayLike<SpeechResult> }
type SpeechRecognitionErrorLike = { error: string }
type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor
  webkitSpeechRecognition?: SpeechRecognitionConstructor
}

const styles = [
  { id: 'tourist', name: 'Tourist', emoji: '📍', description: 'See the iconic highlights' },
  { id: 'local', name: 'Like a local', emoji: '🧭', description: 'Neighborhoods and everyday life' },
  { id: 'explorer', name: 'Explorer', emoji: '🥾', description: 'Find a path less travelled' },
  { id: 'relaxed', name: 'Relaxed', emoji: '🌿', description: 'Space to slow down and linger' },
  { id: 'family', name: 'Family', emoji: '🧑‍🧑‍🧒', description: 'Easy days for everyone' },
  { id: 'backpacker', name: 'Backpacker', emoji: '🎒', description: 'Go light, go a little further' },
  { id: 'luxury', name: 'Luxury', emoji: '✨', description: 'Considered stays and finer details' },
  { id: 'rail', name: 'Rail journey', emoji: '🚆', description: 'Make the train part of the story' },
  { id: 'road', name: 'Road trip', emoji: '🚙', description: 'Take the scenic way around' },
]

const paces = ['Relaxed', 'Balanced', 'Packed'] as const
const interests = ['Food', 'History', 'Nature', 'Beaches', 'Temples', 'Nightlife', 'Shopping', 'Adventure', 'Photography', 'Wildlife']

const examples = [
  '5 days in Kerala with family, ₹40k budget, love nature and food',
  'A relaxed long weekend in Goa with friends',
  'Jaipur for food, history, and photography',
  'A quiet nature escape under ₹20,000',
]

const templates = [
  { title: 'Weekend from Hyderabad', prompt: 'A weekend trip from Hyderabad with good food and a little nature' },
  { title: 'Monsoon in Kerala', prompt: '5 days in Kerala during monsoon, with nature, food, and relaxed mornings' },
  { title: 'Best Vande Bharat trips', prompt: 'A rail-first trip using the best Vande Bharat routes from my city' },
]

function SectionHeading({ id, eyebrow, title, description }: { id?: string; eyebrow?: string; title: string; description?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</p>}
      <h2 id={id} className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h2>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
    </div>
  )
}

export function HomePlanner() {
  const router = useRouter()
  const { startPlan } = useTrip()
  const online = useOnline()
  const { state: saved } = useSavedTrips()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const [prompt, setPrompt] = useState('')
  const [selectedStyle, setSelectedStyle] = useState('explorer')
  const [pace, setPace] = useState<(typeof paces)[number]>('Balanced')
  const [selectedInterests, setSelectedInterests] = useState<string[]>(['Food', 'Nature'])
  const [intakeOpen, setIntakeOpen] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [voiceNotice, setVoiceNotice] = useState('')

  useEffect(() => () => recognitionRef.current?.stop(), [])

  useEffect(() => {
    const seededPrompt = new URLSearchParams(window.location.search).get('prompt')
    if (seededPrompt) setPrompt(seededPrompt.slice(0, 2000))
  }, [])

  const openIntake = () => {
    if (!prompt.trim()) {
      setVoiceNotice('Describe your trip first, or pick one of the examples below.')
      textareaRef.current?.focus()
      return
    }
    setIntakeOpen(true)
  }

  const toggleInterest = (interest: string) => {
    setSelectedInterests((current) => current.includes(interest)
      ? current.filter((item) => item !== interest)
      : [...current, interest])
  }

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop()
      setIsListening(false)
      return
    }

    const browserWindow = window as SpeechWindow
    const SpeechRecognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setVoiceNotice('Voice input is not supported in this browser. You can type your trip idea instead.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-IN'
    recognition.interimResults = false
    recognition.onresult = (event) => {
      const spokenText = Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').trim()
      if (spokenText) setPrompt((current) => [current.trim(), spokenText].filter(Boolean).join(' '))
      setVoiceNotice('Voice note added to your trip idea.')
    }
    recognition.onerror = (event) => {
      setVoiceNotice(event.error === 'not-allowed' ? 'Microphone permission was not granted.' : 'Voice input stopped. You can try again or type your idea.')
      setIsListening(false)
    }
    recognition.onend = () => {
      setIsListening(false)
      recognitionRef.current = null
    }

    try {
      recognitionRef.current = recognition
      recognition.start()
      setIsListening(true)
      setVoiceNotice('Listening in English (India)…')
    } catch {
      recognitionRef.current = null
      setVoiceNotice('Voice input could not start. You can type your trip idea instead.')
    }
  }

  const handlePromptKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) {
      event.preventDefault()
      openIntake()
    }
  }

  // Start streaming right away, then open the planner, which shows days as they arrive.
  const handleBuild = (answers: Record<string, string>) => {
    const id = startPlan({
      text: prompt.trim(),
      style: selectedStyle,
      pace: pace.toLowerCase(),
      interests: selectedInterests.map((i) => i.toLowerCase()),
      answers,
    })
    setIntakeOpen(false)
    router.push(`/trips/${id}`)
  }

  return (
    <div className="mx-auto flex max-w-[1240px] flex-col gap-8 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary">Your next story starts here</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Plan a trip that feels like you.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">Start with a place, a feeling, or a half-formed idea. We&apos;ll help with the details.</p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-2 text-xs text-muted-foreground sm:flex"><Sparkles size={14} className="text-primary" aria-hidden="true" /> Thoughtful plans, made with AI</div>
      </header>

      <RoamlyCard className="p-4 sm:p-6 lg:p-7">
        <div className="mb-3 flex items-center justify-between gap-3">
          <label htmlFor="trip-prompt" className="text-sm font-semibold">Describe your trip</label>
          <span className="text-xs text-muted-foreground">Start anywhere</span>
        </div>
        <div className="relative">
          <textarea
            ref={textareaRef}
            id="trip-prompt"
            value={prompt}
            maxLength={2000}
            onChange={(event) => {
              setPrompt(event.target.value)
              setVoiceNotice('')
            }}
            onKeyDown={handlePromptKeyDown}
            placeholder="Describe your trip… e.g. 5 days in Kerala with family, ₹40k budget, love nature and food"
            className="min-h-36 w-full resize-y rounded-xl border bg-background p-4 pb-12 text-sm leading-6 outline-none transition placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-ring sm:min-h-40"
            aria-describedby="trip-prompt-hint trip-prompt-count"
          />
          <Button
            type="button"
            variant={isListening ? 'secondary' : 'outline'}
            size="icon"
            className={cn('absolute bottom-3 right-3 rounded-full', isListening && 'text-primary')}
            aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
            aria-pressed={isListening}
            onClick={toggleVoiceInput}
          >
            <Mic data-icon="inline-start" aria-hidden="true" />
          </Button>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <p id="trip-prompt-hint" className="text-xs text-muted-foreground">Share dates, budget, who&apos;s going, and what you love.</p>
          <p id="trip-prompt-count" className="text-xs tabular-nums text-muted-foreground" aria-live="polite">{prompt.length.toLocaleString('en-IN')} / 2,000</p>
        </div>
        {voiceNotice && <p role="status" className="mt-2 text-xs text-muted-foreground">{voiceNotice}</p>}
        {!online && <p className="mt-2 text-xs text-muted-foreground">{OFFLINE_REASON}</p>}
        <div className="mt-5 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" size="lg" onClick={openIntake} disabled={!online} title={online ? undefined : OFFLINE_REASON} className="w-full sm:w-auto">
            <Sparkles data-icon="inline-start" aria-hidden="true" />
            Plan my trip
          </Button>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground sm:justify-end">
            <span>or press</span><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">Ctrl</kbd><span>+</span><kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px]">Enter</kbd>
          </p>
        </div>
        <div className="mt-5 border-t pt-4">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Need a starting point?</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {examples.map((example) => <Button key={example} type="button" variant="outline" size="sm" className="h-auto min-h-9 shrink-0 whitespace-nowrap rounded-full px-3 text-xs" onClick={() => { setPrompt(example); textareaRef.current?.focus() }}>{example.length > 44 ? `${example.slice(0, 41)}…` : example}</Button>)}
          </div>
        </div>
      </RoamlyCard>

      <section aria-labelledby="style-heading">
        <SectionHeading id="style-heading" eyebrow="Make it yours" title="What kind of traveller are you?" description="Pick the feeling you want this trip to have." />
        <fieldset>
          <legend className="sr-only">Travel style</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-3">
            {styles.map((style) => {
              const selected = selectedStyle === style.id
              return (
                <label key={style.id} htmlFor={`travel-style-${style.id}`} className={cn('relative flex min-h-[104px] cursor-pointer items-start gap-3 rounded-2xl border bg-card p-3 transition hover:border-primary/50 focus-within:ring-2 focus-within:ring-ring sm:p-4', selected && 'border-primary bg-primary/5')}>
                  <input id={`travel-style-${style.id}`} className="sr-only" type="radio" name="travel-style" value={style.id} checked={selected} onChange={() => setSelectedStyle(style.id)} />
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-xl" aria-hidden="true">{style.emoji}</span>
                  <span className="min-w-0 pt-0.5"><span className="block text-sm font-semibold">{style.name}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{style.description}</span></span>
                  {selected && <Check className="absolute right-3 top-3 text-primary" size={16} aria-hidden="true" />}
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>

      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <section aria-labelledby="pace-heading">
          <SectionHeading id="pace-heading" eyebrow="Find your rhythm" title="Choose your pace" description="We&apos;ll leave room for the moments in between." />
          <fieldset className="rounded-2xl border bg-card p-2">
            <legend className="sr-only">Trip pace</legend>
            <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Trip pace">
              {paces.map((option) => {
                const selected = pace === option
                return <label key={option} htmlFor={`pace-${option.toLowerCase()}`} className={cn('flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-2 text-xs font-semibold text-muted-foreground transition focus-within:ring-2 focus-within:ring-ring sm:text-sm', selected && 'bg-primary text-primary-foreground shadow-sm')}>
                  <input id={`pace-${option.toLowerCase()}`} className="sr-only" type="radio" name="trip-pace" value={option} checked={selected} onChange={() => setPace(option)} />
                  {option}
                </label>
              })}
            </div>
          </fieldset>
        </section>

        <section aria-labelledby="interests-heading">
          <SectionHeading id="interests-heading" eyebrow="The good stuff" title="What are you into?" description="Choose as many as you like." />
          <fieldset>
            <legend className="sr-only">Trip interests</legend>
            <div className="flex flex-wrap gap-2">
              {interests.map((interest) => {
                const selected = selectedInterests.includes(interest)
                return <label key={interest} htmlFor={`interest-${interest.toLowerCase()}`} className={cn('flex min-h-10 cursor-pointer items-center rounded-full border px-3.5 text-sm font-medium text-muted-foreground transition hover:bg-muted focus-within:ring-2 focus-within:ring-ring', selected && 'border-primary bg-primary/10 text-primary')}>
                  <input id={`interest-${interest.toLowerCase()}`} type="checkbox" className="sr-only" checked={selected} onChange={() => toggleInterest(interest)} />
                  {interest}
                </label>
              })}
            </div>
          </fieldset>
        </section>
      </div>

      <section aria-labelledby="recent-trips-heading">
        <div className="mb-4 flex items-end justify-between gap-4">
          <SectionHeading id="recent-trips-heading" eyebrow="Pick up where you left off" title="Recent trips" description="Your ideas and plans, all in one place." />
          <Link href="/trips" className="mb-4 hidden shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline sm:inline-flex">All trips <ChevronRight size={16} aria-hidden="true" /></Link>
        </div>
        {/* Real saved trips (newest three); nothing is shown until they've loaded, so no fake placeholders. */}
        {saved.status === 'ready' && saved.trips.length > 0 ? <div className="grid gap-3 sm:grid-cols-3">
          {saved.trips.slice(0, 3).map((trip) => <Link key={trip.id} href={`/trips/${trip.id}`} className="group rounded-2xl border bg-card p-4 transition hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="text-xs text-muted-foreground">{trip.dayCount} {trip.dayCount === 1 ? 'day' : 'days'}</span>
            <h3 className="mt-2 line-clamp-2 text-base font-semibold group-hover:text-primary">{trip.title}</h3>
            {trip.destination && <p className="mt-1 text-sm text-muted-foreground">{trip.destination}</p>}
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">Open trip <ChevronRight size={15} aria-hidden="true" /></span>
          </Link>)}
        </div> : saved.status === 'ready' ? <EmptyState title="No trips yet" description="Your plans are saved here automatically." /> : null}
      </section>

      <section aria-labelledby="templates-heading">
        <SectionHeading id="templates-heading" eyebrow="A little inspiration" title="Start with a template" description="A few well-loved ways to get going." />
        <div className="grid gap-3 sm:grid-cols-3">
          {templates.map((template) => <button key={template.title} type="button" onClick={() => { setPrompt(template.prompt); textareaRef.current?.focus() }} className="group flex min-h-[82px] items-center justify-between gap-3 rounded-2xl border bg-card px-4 py-4 text-left transition hover:border-primary/40 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span><span className="block text-sm font-semibold">{template.title}</span><span className="mt-1 block text-xs text-muted-foreground">Use this as a starting point</span></span><ChevronRight size={17} className="shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </button>)}
        </div>
      </section>

      {intakeOpen && <IntakeDialog prompt={prompt} onClose={() => setIntakeOpen(false)} onBuild={handleBuild} />}
    </div>
  )
}
