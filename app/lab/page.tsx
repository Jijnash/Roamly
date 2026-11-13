import type { Metadata } from 'next'
import { ReliabilityLab } from '@/components/reliability-lab'

export const metadata: Metadata = { title: 'Reliability lab | Roamly' }

export default function LabPage() {
  return <ReliabilityLab />
}
