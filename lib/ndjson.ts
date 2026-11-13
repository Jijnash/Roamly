/**
 * Reads an NDJSON response body (one JSON value per line) and yields each parsed line.
 * Network chunks can end mid-line, so the unfinished part waits in a buffer.
 * Our own server writes these lines, but a line that fails to parse is still
 * skipped rather than crashing the page.
 */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const parse = (line: string): unknown => {
    try {
      return JSON.parse(line)
    } catch {
      return undefined
    }
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline: number
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (!line) continue
        const parsed = parse(line)
        if (parsed !== undefined) yield parsed
      }
    }
    const last = (buffer + decoder.decode()).trim()
    if (last) {
      const parsed = parse(last)
      if (parsed !== undefined) yield parsed
    }
  } finally {
    reader.releaseLock()
  }
}
