'use client'

import { RoamlyAppShell } from '@/components/roamly-app-shell'
import { HomePlanner } from '@/components/home-planner'

export function RoamlyHome() {
  return (
    <RoamlyAppShell>
      <HomePlanner />
    </RoamlyAppShell>
  )
}
