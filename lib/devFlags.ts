'use client'

import { useSyncExternalStore } from 'react'

/**
 * A tiny in-memory switch for the Reliability lab's "Crash a card" demo.
 * When on, the next day card throws while rendering, so you can see its error
 * boundary catch it. "Reload this section" turns it off again.
 * It lives in module memory: it survives client-side navigation, not a reload.
 */

let crashNextDayCard = false
const listeners = new Set<() => void>()

export function setCrashNextDayCard(on: boolean) {
  crashNextDayCard = on
  listeners.forEach((notify) => notify())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCrashNextDayCard(): boolean {
  return useSyncExternalStore(subscribe, () => crashNextDayCard, () => false)
}

/** Renders nothing, or throws if the crash switch is on. Placed inside a section boundary. */
export function CrashTest() {
  if (useCrashNextDayCard()) throw new Error('Simulated crash from the Reliability lab')
  return null
}
