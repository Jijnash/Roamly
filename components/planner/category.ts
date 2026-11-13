import { BedDouble, MapPin, Navigation, Sparkles, Utensils, Waves, type LucideIcon } from 'lucide-react'
import type { Category } from '@/lib/contracts/types'

export const categoryIcon: Record<Category, LucideIcon> = {
  sight: MapPin,
  food: Utensils,
  activity: Waves,
  transport: Navigation,
  stay: BedDouble,
  other: Sparkles,
}

export const categoryLabel: Record<Category, string> = {
  sight: 'Sight',
  food: 'Food',
  activity: 'Activity',
  transport: 'Transport',
  stay: 'Stay',
  other: 'Other',
}

export const categoryIconStyle: Record<Category, string> = {
  sight: 'bg-category-sight/10 text-category-sight dark:bg-category-sight/15',
  food: 'bg-category-food/15 text-category-food',
  activity: 'bg-category-activity/10 text-category-activity dark:bg-category-activity/15',
  transport: 'bg-category-transport/10 text-category-transport dark:bg-category-transport/15',
  stay: 'bg-category-stay/10 text-category-stay dark:bg-category-stay/15',
  other: 'bg-category-other/10 text-category-other dark:bg-category-other/15',
}
