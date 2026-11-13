import { TripPlanner } from '@/components/planner/trip-planner'

export default async function TripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <TripPlanner id={id} />
}
