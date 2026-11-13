import { describe, expect, it } from 'vitest'
import { createJsonScanner, parseLenient } from '@/lib/jsonScanner'

/** Feeds `chunks` through a fresh scanner and returns everything it found. */
function scan(chunks: string[]) {
  const scanner = createJsonScanner()
  const objects: string[] = []
  let broken = 0
  for (const chunk of chunks) {
    const result = scanner.push(chunk)
    objects.push(...result.objects)
    broken += result.broken
  }
  return { objects, broken, partial: scanner.flush().partial }
}

describe('createJsonScanner', () => {
  it('finds NDJSON objects even when chunks split them anywhere', () => {
    const { objects, partial } = scan(['{"type":"me', 'ta"}\n{"type":"d', 'ay","n":1}\n'])
    expect(objects).toEqual(['{"type":"meta"}', '{"type":"day","n":1}'])
    expect(partial).toBeNull()
  })

  it('returns an object as soon as it closes, before the stream ends', () => {
    const scanner = createJsonScanner()
    expect(scanner.push('{"a":1}\n{"b":').objects).toEqual(['{"a":1}'])
  })

  it('ignores chatter and code fences between objects', () => {
    const { objects } = scan(['Sure! Here you go:\n```json\n{"a":1}\n```\nEnjoy {not json'])
    expect(objects).toEqual(['{"a":1}'])
  })

  it('handles one pretty-printed object over many lines', () => {
    const pretty = JSON.stringify({ days: [{ stops: [{ name: 'A' }] }] }, null, 2)
    expect(scan([pretty]).objects).toEqual([pretty])
  })

  it('is not fooled by braces, quotes and backslashes inside strings', () => {
    const tricky = '{"tip":"say \\"hi\\" {here} and } there","path":"C:\\\\"}'
    const { objects } = scan([tricky])
    expect(objects).toEqual([tricky])
    expect(JSON.parse(objects[0]).tip).toBe('say "hi" {here} and } there')
  })

  it('emits each object of a top-level array separately', () => {
    expect(scan(['[{"a":1},', '{"b":2}]']).objects).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('drops an NDJSON line cut off inside a string, and keeps the next lines', () => {
    const { objects, broken } = scan(['{"type":"day","title":"Bea\n{"type":"day","title":"OK"}\n'])
    expect(objects).toEqual(['{"type":"day","title":"OK"}'])
    expect(broken).toBe(1)
  })

  it('drops an NDJSON line cut off outside a string, and keeps the next lines', () => {
    const { objects, broken } = scan(['{"type":"day","stops":[{"name":"A"}\n{"type":"info"}\n'])
    expect(objects).toEqual(['{"type":"info"}'])
    expect(broken).toBe(1)
  })

  it('reports the unfinished object when the stream stops mid-object', () => {
    const { objects, partial } = scan(['{"a":1}\n{"type":"day","title":"Hal'])
    expect(objects).toEqual(['{"a":1}'])
    expect(partial).toBe('{"type":"day","title":"Hal')
  })
})

describe('parseLenient', () => {
  it('parses valid JSON normally', () => {
    expect(parseLenient('{"a":[1,2]}')).toEqual({ a: [1, 2] })
  })

  it('fixes trailing commas and smart quotes', () => {
    expect(parseLenient('{"a":[1,2,],}')).toEqual({ a: [1, 2] })
    expect(parseLenient('{\u201ca\u201d:\u201cb\u201d}')).toEqual({ a: 'b' })
  })

  it('returns undefined for text that cannot be repaired', () => {
    expect(parseLenient('{"a" "b"}')).toBeUndefined()
    expect(parseLenient('')).toBeUndefined()
  })
})
