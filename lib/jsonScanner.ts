/**
 * Finds complete JSON objects in a stream of text chunks.
 *
 * Models don't always return clean NDJSON. This scanner copes with:
 *   - objects split across chunks at any character
 *   - chatter or ``` code fences between objects (ignored)
 *   - one big pretty-printed object spread over many lines
 *   - braces and quotes inside strings ("say \"hi\" {here}")
 *   - a top-level array of objects (each object comes out separately)
 *
 * It tracks three things per character: brace depth, whether we're inside a
 * string, and whether the previous character was a backslash. When depth goes
 * back to 0, one object is complete and its text is returned. Parsing that text
 * is a separate step (parseLenient), so one bad object never stops the rest.
 *
 * Broken objects: in NDJSON every object sits on one line, so a raw line break
 * inside a string, or inside a one-line `{"type"...}` object, means that line was
 * cut off. The scanner drops it (counted in `broken`) and carries on with the next line.
 */

export type ScanResult = { objects: string[]; broken: number }

// A one-line NDJSON event starts like {"type" (pretty-printed objects start with "{\n").
const NDJSON_START = /^\{ ?"type"/

export function createJsonScanner() {
  let depth = 0
  let inString = false
  let escaped = false
  let current = ''

  function reset() {
    depth = 0
    inString = false
    escaped = false
    current = ''
  }

  return {
    /** Feed the next chunk; returns the objects completed by it. */
    push(chunk: string): ScanResult {
      const objects: string[] = []
      let broken = 0

      for (const ch of chunk) {
        if (depth === 0) {
          // Outside any object: skip everything until an opening brace.
          if (ch === '{') {
            depth = 1
            current = '{'
          }
          continue
        }

        if (ch === '\n' && (inString || NDJSON_START.test(current))) {
          broken++
          reset()
          continue
        }

        current += ch
        if (inString) {
          if (escaped) escaped = false
          else if (ch === '\\') escaped = true
          else if (ch === '"') inString = false
          continue
        }

        if (ch === '"') inString = true
        else if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            objects.push(current)
            current = ''
          }
        }
      }
      return { objects, broken }
    },

    /** Call when the stream ends. Returns the unfinished object's text, if the stream stopped mid-object. */
    flush(): { partial: string | null } {
      const partial = depth > 0 && current.trim() !== '' ? current : null
      reset()
      return { partial }
    },
  }
}

/**
 * JSON.parse that forgives the two mistakes models make most often:
 * trailing commas ({"a":1,}) and curly "smart" quotes around keys and strings.
 * Returns undefined when the text still isn't valid JSON.
 *
 * Note: the trailing-comma fix is a simple pattern and could, in theory, touch a
 * string containing ",}" — acceptable because it only runs after a normal parse failed.
 */
export function parseLenient(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // fall through to the repairs below
  }
  const repaired = text
    .replace(/[“”]/g, '"')
    .replace(/,\s*([}\]])/g, '$1')
  try {
    return JSON.parse(repaired)
  } catch {
    return undefined
  }
}
