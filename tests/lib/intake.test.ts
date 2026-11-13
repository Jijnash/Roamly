import { describe, expect, it } from 'vitest'
import { DEFAULT_QUESTIONS, normalizeIntake } from '@/lib/contracts/intake'
import { ModelOutputError } from '@/lib/contracts/plan'
import { POST as intake } from '@/app/api/intake/route'

describe('normalizeIntake', () => {
  it('keeps known facts and valid questions, capped at 5', () => {
    const { value } = normalizeIntake({
      known: { destination: 'Goa', days: 4, password: 'x' },
      questions: [
        { id: 'origin', label: 'Where are you starting from?', type: 'text' },
        { id: 'Who is going', label: "Who's going?", type: 'select', options: ['Solo', 'Friends'] },
        { id: 'food', label: 'Food?', type: 'multi', options: ['Veg'] }, // 1 option: asked as text
        { label: '' }, // no label: dropped
        { id: 'destination', label: 'Where to?', type: 'text' }, // already known: dropped
        { id: 'origin', label: 'Duplicate', type: 'text' }, // duplicate id: dropped
        { id: 'a', label: 'A', type: 'text' }, { id: 'b', label: 'B', type: 'text' }, { id: 'c', label: 'C', type: 'text' },
      ],
    })
    expect(value.known).toEqual({ destination: 'Goa', days: '4' })
    expect(value.questions.map((q) => q.id)).toEqual(['origin', 'who_is_going', 'food', 'a', 'b'])
    expect(value.questions[1]).toMatchObject({ type: 'chips', options: ['Solo', 'Friends'] })
    expect(value.questions[2]).toMatchObject({ type: 'text', options: [] })
  })

  it('accepts "nothing missing" and rejects junk', () => {
    expect(normalizeIntake({ known: { destination: 'Goa' }, questions: [] }).value.questions).toEqual([])
    expect(() => normalizeIntake('hello')).toThrow(ModelOutputError)
    expect(() => normalizeIntake({})).toThrow(ModelOutputError)
  })

  it('the fallback questions are themselves valid', () => {
    expect(normalizeIntake({ questions: DEFAULT_QUESTIONS }).value.questions).toEqual(DEFAULT_QUESTIONS)
  })
})

describe('POST /api/intake (mock provider)', () => {
  const post = (body: unknown) => new Request('http://localhost/api/intake', { method: 'POST', headers: { 'x-forwarded-for': '10.7.7.7' }, body: JSON.stringify(body) })

  it('reports what the text already says and only asks the rest', async () => {
    const body = await (await intake(post({ text: '4 days in Goa with friends from Hyderabad' }))).json()
    expect(body.known).toEqual({ destination: 'Goa', days: '4', travellers: 'friends', origin: 'Hyderabad' })
    expect(body.questions.map((q: { id: string }) => q.id)).toEqual(['budget', 'food'])
  })

  it('rejects empty text', async () => {
    expect((await intake(post({ text: ' ' }))).status).toBe(400)
  })
})
