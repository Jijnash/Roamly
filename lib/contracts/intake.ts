import { LIMITS } from '@/lib/limits'
import { cleanList, cleanText, isObject, pick } from '@/lib/contracts/clean'
import { ModelOutputError, type Normalized } from '@/lib/contracts/plan'

/**
 * Intake: what the AI understood from the trip text, plus only the questions
 * still worth asking. Rendered as chips, toggles, a number stepper or a text field.
 */

export const QUESTION_TYPES = ['chips', 'multi', 'number', 'text'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export type IntakeQuestion = {
  id: string
  label: string
  type: QuestionType
  /** Choices for chips (pick one) and multi (pick any). */
  options: string[]
  default?: string
}

export type Intake = {
  /** Facts already in the text, e.g. { destination: 'Goa', days: '4' }. Shown as removable chips. */
  known: Record<string, string>
  questions: IntakeQuestion[]
}

const KNOWN_KEYS = ['destination', 'days', 'travellers', 'budget', 'origin', 'month', 'dates'] as const
const MAX_QUESTIONS = 5

/** Used when the intake AI fails or is offline, so planning is never blocked. */
export const DEFAULT_QUESTIONS: IntakeQuestion[] = [
  { id: 'origin', label: 'Where are you starting from?', type: 'text', options: [] },
  { id: 'days', label: 'How many days?', type: 'number', options: [], default: '3' },
  { id: 'travellers', label: "Who's going?", type: 'chips', options: ['Solo', 'Couple', 'Friends', 'Family with kids'] },
  { id: 'budget', label: 'Budget per person', type: 'chips', options: ['Under ₹15k', '₹15k–40k', '₹40k+'] },
  { id: 'food', label: 'Food preferences', type: 'multi', options: ['Veg', 'Non-veg', 'Jain'] },
]

function slug(value: unknown): string {
  return cleanText(value, 30).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

function normalizeQuestion(raw: unknown): IntakeQuestion | null {
  if (!isObject(raw)) return null
  const label = cleanText(pick(raw, ['label', 'question', 'text']), LIMITS.titleChars)
  const id = slug(pick(raw, ['id', 'key', 'name'])) || slug(label)
  const typeText = cleanText(raw.type, 20).toLowerCase()
  let type: QuestionType = (QUESTION_TYPES as readonly string[]).includes(typeText) ? (typeText as QuestionType) : 'text'
  if (typeText === 'select' || typeText === 'choice' || typeText === 'single') type = 'chips'
  if (typeText === 'checkbox' || typeText === 'multiselect') type = 'multi'
  const options = cleanList(raw.options, 6, 30)
  if (!label || !id) return null
  // A choice question with fewer than 2 options can't be answered by picking, so ask it as text.
  if ((type === 'chips' || type === 'multi') && options.length < 2) type = 'text'
  const fallback = cleanText(raw.default, 30)
  return { id, label, type, options: type === 'chips' || type === 'multi' ? options : [], ...(fallback && { default: fallback }) }
}

export function normalizeIntake(raw: unknown): Normalized<Intake> {
  if (!isObject(raw)) throw new ModelOutputError('intake is not an object')
  const known: Record<string, string> = {}
  if (isObject(raw.known)) {
    for (const key of KNOWN_KEYS) {
      const value = cleanText(raw.known[key], 60)
      if (value) known[key] = value
    }
  }
  const seen = new Set<string>()
  const questions = (Array.isArray(raw.questions) ? raw.questions : [])
    .map(normalizeQuestion)
    .filter((q): q is IntakeQuestion => q !== null && !seen.has(q.id) && !known[q.id] && Boolean(seen.add(q.id)))
    .slice(0, MAX_QUESTIONS)
  if (!Array.isArray(raw.questions) && Object.keys(known).length === 0) throw new ModelOutputError('intake has no content')
  return { value: { known, questions }, warnings: [] }
}
