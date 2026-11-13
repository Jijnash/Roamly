import { describe, expect, it } from 'vitest'
import { cleanList, cleanNumber, cleanText } from '@/lib/contracts/clean'
import {
  ModelOutputError,
  normalizeCategory,
  normalizeDay,
  normalizeInfo,
  normalizePlan,
  normalizeStays,
  normalizeTime,
  normalizeTransport,
  normalizeAlternatives,
  toPlanParts,
} from '@/lib/contracts/plan'
import { parseAlternativesRequest, parseDayRequest, parsePlanRequest, parseRefineRequest, readJsonBody } from '@/lib/contracts/requests'
import { LIMITS } from '@/lib/limits'

const stop = (extra: Record<string, unknown> = {}) => ({ name: 'Fort Aguada', time: '09:30', category: 'sight', ...extra })

describe('clean helpers', () => {
  it('cleanText strips control characters, collapses spaces and caps length', () => {
    expect(cleanText('  a\n\tb\u0000c  ', 10)).toBe('a b c')
    expect(cleanText('x'.repeat(20), 10)).toHaveLength(10)
    expect(cleanText({ evil: true }, 10)).toBe('')
    expect(cleanText(42, 10)).toBe('42')
  })

  it('cleanList accepts a single string and drops empties', () => {
    expect(cleanList('one', 5, 10)).toEqual(['one'])
    expect(cleanList(['a', '', null, 'b'], 5, 10)).toEqual(['a', 'b'])
  })

  it('cleanNumber reads "₹4,500" and rejects out-of-range values', () => {
    expect(cleanNumber('₹4,500', 10_000)).toBe(4500)
    expect(cleanNumber(-1, 10)).toBeNull()
    expect(cleanNumber('lots', 10)).toBeNull()
  })
})

describe('field normalizers', () => {
  it('normalizeTime converts common formats to HH:MM and rejects nonsense', () => {
    expect(normalizeTime('9:30 am')).toBe('09:30')
    expect(normalizeTime('2pm')).toBe('14:00')
    expect(normalizeTime('12 am')).toBe('00:00')
    expect(normalizeTime('14.05')).toBe('14:05')
    expect(normalizeTime('25:00')).toBe('')
    expect(normalizeTime('morning')).toBe('')
    expect(normalizeTime('9')).toBe('')
  })

  it('normalizeCategory maps synonyms and falls back to other', () => {
    expect(normalizeCategory('Food')).toBe('food')
    expect(normalizeCategory('Sightseeing')).toBe('sight')
    expect(normalizeCategory('lunch at a cafe')).toBe('food')
    expect(normalizeCategory('<script>')).toBe('other')
  })
})

describe('normalizeDay', () => {
  it('accepts the expected shape', () => {
    const { value, warnings } = normalizeDay({ title: 'Beaches', stayArea: 'Candolim', stops: [stop()] })
    expect(value.stops[0]).toEqual({ name: 'Fort Aguada', time: '09:30', duration: '', category: 'sight', description: '', tip: '' })
    expect(warnings).toEqual([])
  })

  it('accepts common variants of key names', () => {
    const { value } = normalizeDay({ theme: 'Old Goa', activities: [{ place: 'Se Cathedral', at: '10 am', notes: 'Big church', tips: ['Go early', 'x'], duration: 45 }] })
    expect(value.title).toBe('Old Goa')
    expect(value.stops[0]).toMatchObject({ name: 'Se Cathedral', time: '10:00', description: 'Big church', tip: 'Go early', duration: '45 min' })
  })

  it('drops stops without a name and trims to the stop limit, with warnings', () => {
    const stops = [stop(), { time: '10:00' }, ...Array.from({ length: LIMITS.stopsPerDay + 2 }, (_, i) => stop({ name: `S${i}` }))]
    const { value, warnings } = normalizeDay({ title: 'Busy', stops })
    expect(value.stops).toHaveLength(LIMITS.stopsPerDay)
    expect(warnings).toEqual(['Skipped 1 unreadable stop on "Busy".', `Trimmed "Busy" to ${LIMITS.stopsPerDay} stops.`])
  })

  it('throws when nothing usable is left', () => {
    expect(() => normalizeDay({ title: 'x' })).toThrow(ModelOutputError)
    expect(() => normalizeDay({ stops: [{ time: '09:00' }] })).toThrow(ModelOutputError)
    expect(() => normalizeDay('a day')).toThrow(ModelOutputError)
  })
})

describe('other sections', () => {
  it('normalizeTransport maps modes and drops legs without both ends', () => {
    expect(normalizeTransport({ legs: [{ from: 'A', to: 'B', mode: 'Vande Bharat' }, { from: 'A' }] })).toEqual([
      { from: 'A', to: 'B', mode: 'train', reason: '' },
    ])
    expect(() => normalizeTransport({ legs: [] })).toThrow(ModelOutputError)
  })

  it('normalizeStays keeps valid day indexes and maps tiers', () => {
    const [night] = normalizeStays({ nights: [{ dayIndexes: [0, 1, 99, 'x'], area: 'Panjim', options: [{ name: 'Inn', tier: 'luxury' }, { tier: 'budget' }] }] }, 3)
    expect(night).toEqual({ dayIndexes: [0, 1], area: 'Panjim', options: [{ name: 'Inn', tier: 'premium', why: '' }] })
  })

  it('normalizeInfo range-checks budget numbers and defaults the currency', () => {
    const info = normalizeInfo({ budget: { currency: 'rupees', breakdown: [{ label: 'Stay', amount: '7000' }, { label: 'Bad', amount: -5 }] }, packing: 'Sunscreen' })
    expect(info.budget).toEqual({ currency: 'INR', perPerson: 7000, breakdown: [{ label: 'Stay', amount: 7000 }] })
    expect(info.packing).toEqual(['Sunscreen'])
    expect(() => normalizeInfo({})).toThrow(ModelOutputError)
  })
})

describe('toPlanParts', () => {
  it('uses the type field when present', () => {
    expect(toPlanParts({ type: 'meta', title: 'Goa' }).parts[0]).toMatchObject({ type: 'meta', meta: { title: 'Goa' } })
  })

  it('guesses the kind from the keys when type is missing', () => {
    expect(toPlanParts({ stops: [stop()] }).parts[0].type).toBe('day')
    expect(toPlanParts({ legs: [{ from: 'A', to: 'B' }] }).parts[0].type).toBe('transport')
  })

  it('expands a whole-plan object (wrong shape) into meta + days', () => {
    const { parts } = toPlanParts({ itinerary: [{ theme: 'D1', activities: [{ place: 'P' }] }, { theme: 'D2', activities: [{ place: 'Q' }] }] })
    expect(parts.map((p) => p.type)).toEqual(['meta', 'day', 'day'])
  })

  it('turns an unusable piece into a warning instead of throwing', () => {
    expect(toPlanParts({ type: 'day', stops: [] })).toEqual({ parts: [], warnings: ['Skipped a day because it could not be read.'] })
    expect(toPlanParts({ nonsense: 1 }).warnings).toHaveLength(1)
    expect(toPlanParts('text').parts).toEqual([])
  })
})

describe('normalizePlan', () => {
  it('builds a full plan and keeps optional sections', () => {
    const { value } = normalizePlan({ title: 'Trip', days: [{ stops: [stop()] }], transport: { legs: [{ from: 'A', to: 'B', mode: 'bus' }] }, info: { tips: ['t'] } })
    expect(value.meta.title).toBe('Trip')
    expect(value.days).toHaveLength(1)
    expect(value.transport[0].mode).toBe('bus')
    expect(value.info?.tips).toEqual(['t'])
  })

  it('throws when there are no usable days', () => {
    expect(() => normalizePlan({ title: 'x', days: 'nope' })).toThrow(ModelOutputError)
    expect(() => normalizePlan(null)).toThrow(ModelOutputError)
  })
})

describe('request parsing', () => {
  it('parsePlanRequest keeps known fields and drops the rest', () => {
    const req = parsePlanRequest({ text: ' 3 days in Goa ', style: 'LOCAL', pace: 'warp', interests: ['food', 3], answers: { origin: 'Hyderabad' }, admin: true })
    expect(req).toEqual({ text: '3 days in Goa', style: 'local', pace: undefined, interests: ['food', '3'], answers: { origin: 'Hyderabad' } })
  })

  it('parsePlanRequest keeps a known chaos trigger and drops anything else', () => {
    expect(parsePlanRequest({ text: 'x', chaos: 'cutoff' }).chaos).toBe('cutoff')
    expect(parsePlanRequest({ text: 'x', chaos: 'rm -rf' }).chaos).toBeUndefined()
  })

  it('parsePlanRequest rejects missing, empty and over-long text', () => {
    expect(() => parsePlanRequest({})).toThrow(/Describe your trip/)
    expect(() => parsePlanRequest({ text: '   ' })).toThrow(/Describe your trip/)
    expect(() => parsePlanRequest({ text: 'x'.repeat(LIMITS.inputChars + 1) })).toThrow(/under/)
  })

  it('parsePlanRequest accepts a valid resume and ignores a bad one', () => {
    expect(parsePlanRequest({ text: 'x', resume: { fromDay: 2, previousTitles: ['A', 'B'] } }).resume).toEqual({ fromDay: 2, previousTitles: ['A', 'B'] })
    expect(parsePlanRequest({ text: 'x', resume: { fromDay: -1 } }).resume).toBeUndefined()
  })

  it('parseRefineRequest needs a plan object and an instruction', () => {
    expect(() => parseRefineRequest({ instruction: 'x' })).toThrow()
    expect(() => parseRefineRequest({ plan: {}, instruction: ' ' })).toThrow()
    expect(parseRefineRequest({ plan: {}, instruction: 'cheaper' }).instruction).toBe('cheaper')
  })

  it('readJsonBody rejects bad JSON and oversized bodies with INVALID_INPUT', async () => {
    const post = (body: string) => new Request('http://x', { method: 'POST', body })
    await expect(readJsonBody(post('{bad'))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(readJsonBody(post('"' + 'x'.repeat(LIMITS.bodyBytes) + '"'))).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})

describe('normalizeAlternatives', () => {
  it('keeps up to 3 valid, distinct stops that differ from the current one', () => {
    const raw = { options: [{ name: 'Se Cathedral' }, { name: 'Fort' }, { name: 'fort' }, { time: '9' }, { name: 'Museum' }, { name: 'Market' }, { name: 'Extra' }] }
    const { value, warnings } = normalizeAlternatives(raw, 'Se Cathedral')
    expect(value.map((s) => s.name)).toEqual(['Fort', 'Museum', 'Market'])
    expect(warnings).toEqual([])
  })

  it('warns when fewer than 3 come back and throws when none are usable', () => {
    expect(normalizeAlternatives({ alternatives: [{ name: 'Fort' }] }, 'X').warnings).toHaveLength(1)
    expect(() => normalizeAlternatives({ alternatives: [{ name: 'X' }] }, 'X')).toThrow(ModelOutputError)
    expect(() => normalizeAlternatives('nope', 'X')).toThrow(ModelOutputError)
  })
})

describe('day and alternatives requests', () => {
  const context = { destination: 'Goa', title: 'Goa', days: [{ title: 'A', stops: ['x'] }, { title: 'B', stops: ['y'] }], secret: 1 }

  it('parseDayRequest validates the day index and keeps an optional note', () => {
    expect(parseDayRequest({ context, dayIndex: 1, day: {}, note: ' more food ' })).toMatchObject({ dayIndex: 1, note: 'more food' })
    expect(() => parseDayRequest({ context, dayIndex: 5, day: {} })).toThrow(/Unknown day/)
    expect(() => parseDayRequest({ dayIndex: 0 })).toThrow(/context/)
  })

  it('parseAlternativesRequest strips unknown context fields', () => {
    const parsed = parseAlternativesRequest({ context, dayIndex: 0, stop: { name: 'x' } })
    expect(parsed.context).toEqual({ destination: 'Goa', title: 'Goa', style: undefined, pace: undefined, days: context.days })
  })
})
