/** Collects every item of an async iterable into an array. */
export async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = []
  for await (const item of source) items.push(item)
  return items
}

/** Builds a fetch Response whose body streams the given string chunks. */
export function streamResponse(chunks: string[], init: ResponseInit = {}): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(body, init)
}

/** Runs `fn` and returns what it threw (fails the test if nothing was thrown). */
export async function caught(fn: () => Promise<unknown>): Promise<any> {
  try {
    await fn()
  } catch (err) {
    return err
  }
  throw new Error('expected an error to be thrown')
}
