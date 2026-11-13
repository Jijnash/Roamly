'use client'

import { BedDouble, Bus, Car, Languages, Lightbulb, MapPinned, Plane, Ship, ShieldAlert, Train, Wallet, Luggage, Route, type LucideIcon } from 'lucide-react'
import { RoamlyCard } from '@/components/roamly-ui'
import { googleMapsSearchUrl } from '@/lib/deeplinks'
import type { StayNight, TransportLeg, TransportMode, TripInfo } from '@/lib/contracts/types'

/**
 * "Blocks": each kind of data the AI returns gets its own component, chosen by
 * the event type it arrived in (meta.why, info.budget, info.packing, transport,
 * stays, info.tips/safety/phrases). A block renders nothing when its data is missing.
 */

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount)
  } catch {
    return `${currency} ${amount.toLocaleString('en-IN')}`
  }
}

function BlockTitle({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return <h2 className="flex items-center gap-2 text-sm font-semibold"><Icon size={16} className="text-primary" aria-hidden="true" />{children}</h2>
}

export function WhyBlock({ why }: { why: string[] }) {
  if (why.length === 0) return null
  return (
    <RoamlyCard className="p-4">
      <BlockTitle icon={Lightbulb}>Why this plan</BlockTitle>
      <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-xs text-muted-foreground">{why.map((w, i) => <li key={i}>{w}</li>)}</ul>
    </RoamlyCard>
  )
}

/** Budget as a bar chart. Each bar's width is its share of the per-person total. */
export function BudgetBlock({ budget }: { budget: TripInfo['budget'] }) {
  if (!budget) return null
  const largest = Math.max(budget.perPerson, ...budget.breakdown.map((b) => b.amount), 1)
  return (
    <RoamlyCard className="p-4">
      <BlockTitle icon={Wallet}>Budget estimate</BlockTitle>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{formatMoney(budget.perPerson, budget.currency)}</p>
      <p className="text-xs text-muted-foreground">per person · rough estimate, check live prices</p>
      {budget.breakdown.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2.5" aria-label="Budget breakdown">
          {budget.breakdown.map((item) => {
            const share = Math.round((item.amount / largest) * 100)
            return (
              <li key={item.label} className="text-xs">
                <div className="flex justify-between gap-2"><span>{item.label}</span><span className="tabular-nums text-muted-foreground">{formatMoney(item.amount, budget.currency)}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${share}%` }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </RoamlyCard>
  )
}

/** Packing list as a checklist. Ticks are saved with the trip and can be undone. */
export function PackingBlock({ items, packed, locked, onToggle }: { items: string[]; packed: string[]; locked: boolean; onToggle: (item: string) => void }) {
  if (items.length === 0) return null
  const done = items.filter((i) => packed.includes(i)).length
  return (
    <RoamlyCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <BlockTitle icon={Luggage}>Packing list</BlockTitle>
        <span className="text-xs text-muted-foreground">{done}/{items.length} packed</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${(done / items.length) * 100}%` }} /></div>
      <ul className="mt-3 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item}>
            <label className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-lg px-1 text-sm hover:bg-muted">
              <input type="checkbox" className="size-4 accent-primary" checked={packed.includes(item)} disabled={locked} onChange={() => onToggle(item)} />
              <span className={packed.includes(item) ? 'text-muted-foreground line-through' : ''}>{item}</span>
            </label>
          </li>
        ))}
      </ul>
    </RoamlyCard>
  )
}

const MODE_ICON: Record<TransportMode, LucideIcon> = { train: Train, flight: Plane, bus: Bus, car: Car, cab: Car, ferry: Ship, other: Route }

export function TransportBlock({ legs }: { legs: TransportLeg[] }) {
  if (legs.length === 0) return null
  return (
    <RoamlyCard className="p-4">
      <BlockTitle icon={Route}>Getting there</BlockTitle>
      <ul className="mt-3 flex flex-col gap-3">
        {legs.map((leg, i) => {
          const Icon = MODE_ICON[leg.mode]
          return (
            <li key={i} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-category-transport/10 text-category-transport"><Icon size={16} aria-hidden="true" /></span>
              <div className="min-w-0 text-sm">
                <p className="font-medium">{leg.from} → {leg.to} <span className="font-normal capitalize text-muted-foreground">· {leg.mode}</span></p>
                {leg.reason && <p className="mt-0.5 text-xs text-muted-foreground">{leg.reason}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">Suggestions only. Check timings and fares with the operator before booking.</p>
    </RoamlyCard>
  )
}

const TIER_LABEL = { budget: 'Budget', mid: 'Mid-range', premium: 'Premium' } as const

export function StaysBlock({ nights, destination }: { nights: StayNight[]; destination: string }) {
  if (nights.length === 0) return null
  return (
    <RoamlyCard className="p-4">
      <BlockTitle icon={BedDouble}>Where to stay</BlockTitle>
      <ul className="mt-3 flex flex-col gap-4">
        {nights.map((night, i) => (
          <li key={i} className="text-sm">
            <p className="font-medium">
              {night.area || 'Stay'}
              {night.dayIndexes.length > 0 && <span className="font-normal text-muted-foreground"> · {night.dayIndexes.length === 1 ? `night of day ${night.dayIndexes[0] + 1}` : `days ${night.dayIndexes[0] + 1}–${night.dayIndexes[night.dayIndexes.length - 1] + 1}`}</span>}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {night.options.map((option) => {
                const url = googleMapsSearchUrl(option.name, night.area || destination)
                return (
                  <li key={option.name} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="rounded-full bg-category-stay/10 px-2 py-0.5 font-medium text-category-stay">{TIER_LABEL[option.tier]}</span>
                    {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-primary underline-offset-4 hover:underline">{option.name}<MapPinned size={12} className="ml-1 inline" aria-hidden="true" /><span className="sr-only"> (opens Google Maps)</span></a> : <span className="font-medium">{option.name}</span>}
                    {option.why && <span className="w-full text-muted-foreground">{option.why}</span>}
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] text-muted-foreground">AI suggestions, not verified listings. Check reviews and live prices.</p>
    </RoamlyCard>
  )
}

export function TipsBlock({ info }: { info: TripInfo | null }) {
  if (!info || (info.tips.length === 0 && info.safety.length === 0 && info.phrases.length === 0)) return null
  return (
    <RoamlyCard className="flex flex-col gap-4 p-4">
      {info.tips.length > 0 && (
        <div>
          <BlockTitle icon={Lightbulb}>Local tips</BlockTitle>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-xs text-muted-foreground">{info.tips.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {info.safety.length > 0 && (
        <div className="rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/10 p-3">
          <BlockTitle icon={ShieldAlert}>Stay safe</BlockTitle>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-xs">{info.safety.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
      {info.phrases.length > 0 && (
        <div>
          <BlockTitle icon={Languages}>Useful phrases</BlockTitle>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-muted-foreground">{info.phrases.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
      )}
    </RoamlyCard>
  )
}
