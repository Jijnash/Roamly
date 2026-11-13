import 'server-only'
import { AppError } from '@/lib/errors'
import type { ServerConfig } from '@/lib/server/config'
import type { ModelRequest, Provider } from '@/lib/server/ai/types'
import { fetchProvider, parseEvent, readSseData } from '@/lib/server/ai/http'

/**
 * Google Gemini, through the streamGenerateContent REST endpoint with SSE (alt=sse),
 * using plain fetch. The key goes in a header, never in the URL, so it can't leak into logs.
 */

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

type GeminiEvent = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  error?: { message?: string }
}

export function createGeminiProvider(cfg: ServerConfig['gemini']): Provider {
  return {
    name: 'gemini',
    async *stream(req: ModelRequest) {
      const model = req.tier === 'strong' ? cfg.modelStrong : cfg.modelFast
      const url = `${BASE_URL}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`
      const body = {
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.user }] }],
        generationConfig: {
          temperature: 0.4,
          ...(req.json && { responseMimeType: 'application/json' }),
        },
      }

      const res = await fetchProvider('gemini', url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify(body),
        signal: req.signal,
      })

      for await (const data of readSseData(res.body!)) {
        const event = parseEvent(data) as GeminiEvent | null
        if (event?.error) {
          console.error('[ai] gemini stream error:', event.error.message)
          throw new AppError('UPSTREAM_ERROR')
        }
        // Skip "thought" parts from thinking models; only the answer text is used.
        const parts = event?.candidates?.[0]?.content?.parts ?? []
        const text = parts.filter((p) => !p.thought).map((p) => p.text ?? '').join('')
        if (text) yield text
      }
    },
  }
}
