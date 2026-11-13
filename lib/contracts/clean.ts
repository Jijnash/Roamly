/**
 * Small helpers that turn untrusted values (AI output, request bodies, saved data)
 * into safe, bounded values. They never throw: bad input becomes "" / [] / null,
 * and the caller decides whether that makes the whole item unusable.
 */

/** Any value → a trimmed single-line string without control characters, capped at `max` chars. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value)
  if (typeof value !== 'string') return ''
  const text = value
    .replace(/[\u0000-\u001f\u007f]+/g, ' ') // control characters, including newlines and tabs
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text
}

/** Any value → a list of clean, non-empty strings (at most `maxItems`). A single string becomes a one-item list. */
export function cleanList(value: unknown, maxItems: number, maxChars: number): string[] {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? [value] : []
  return items
    .map((item) => cleanText(item, maxChars))
    .filter((item) => item !== '')
    .slice(0, maxItems)
}

/** Number or numeric string ("₹4,500", "4500") → a number in [0, max], or null. */
export function cleanNumber(value: unknown, max: number): number | null {
  // Strip currency signs and commas. Careful: Number('') is 0, so text with no digits must become NaN, not ₹0.
  const digits = typeof value === 'string' ? value.replace(/[^\d.]/g, '') : ''
  const n = typeof value === 'number' ? value : digits !== '' ? Number(digits) : NaN
  if (!Number.isFinite(n) || n < 0 || n > max) return null
  return Math.round(n)
}

/** Returns the first key of `obj` that has a non-empty value, so we can accept common variants ("name" / "place" / "title"). */
export function pick(obj: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = obj[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
