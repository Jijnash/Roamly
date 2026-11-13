import 'server-only'
import { AppError } from '@/lib/errors'
import type { ServerConfig } from '@/lib/server/config'
import type { ModelRequest, Provider } from '@/lib/server/ai/types'
import { fetchProvider, parseEvent, readSseData } from '@/lib/server/ai/http'

/**
 * Groq, through its OpenAI-compatible chat completions API, with plain fetch (no SDK),
 * so every step is visible: send the request, read SSE events, yield each text delta.
 */

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

type GroqEvent = {
  choices?: { delta?: { content?: string | null } }[]
  error?: { message?: string }
}

export function createGroqProvider(cfg: ServerConfig['groq']): Provider {
  return {
    name: 'groq',
    async *stream(req: ModelRequest) {
      const model = req.tier === 'strong' ? cfg.modelStrong : cfg.modelFast
      const body = {
        model,
        stream: true,
        temperature: 0.4,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        // gpt-oss models "think" before answering. Low effort keeps the first day fast;
        // the reasoning arrives in a separate field, which we ignore.
        ...(model.startsWith('openai/gpt-oss') && { reasoning_effort: 'low' }),
        // No response_format here: Groq's structured-output mode does not support streaming.
        // The prompt asks for JSON and our scanner + validators handle whatever comes back.
      }

      const res = await fetchProvider('groq', GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify(body),
        signal: req.signal,
      })

      for await (const data of readSseData(res.body!)) {
        if (data === '[DONE]') return
        const event = parseEvent(data) as GroqEvent | null
        if (event?.error) {
          console.error('[ai] groq stream error:', event.error.message)
          throw new AppError('UPSTREAM_ERROR')
        }
        const text = event?.choices?.[0]?.delta?.content
        if (text) yield text
      }
    },
  }
}
