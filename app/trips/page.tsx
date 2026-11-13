import type { Metadata } from 'next'
import { MyTrips } from '@/components/my-trips'

export const metadata: Metadata = { title: 'My trips | Roamly' }

export default function TripsPage() {
  return <MyTrips />
}
