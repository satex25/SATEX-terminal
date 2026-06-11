/**
 * SATEX — Provider-agnostic advisory-LLM client.
 *
 * One tiny surface: OpenAI-compatible `POST {baseUrl}/chat/completions`.
 * That single convention is spoken by OpenAI, Groq, OpenRouter, Together,
 * Mistral, DeepSeek, Baidu AI Studio, and local runtimes (Ollama, LM Studio,
 * llama.cpp server) — so the "model" is a settings row, not a code change.
 *
 * Invariants (do not break):
 *   - MAIN-PROCESS ONLY. The renderer never talks to an LLM endpoint; its CSP
 *     deliberately has no LLM hosts (2026-06-10 audit §3.6).
 *   - ADVISORY ONLY. Output is a rationale string for display/journaling. It
 *     must never gate, size, or route an order. The local Brain decides;
 *     the LLM narrates.
 *   - Every call carries an AbortSignal timeout (audit §3.1 — a hung LLM
 *     socket once meant a silently stalled autonomous loop).
 */
import { createLogger } from './logger'

const log = createLogger('llm')

/** Hard ceiling on any advisory round trip. Mirrors AlpacaClient.REST_TIMEOUT_MS. */
export const LLM_TIMEOUT_MS = 10_000

export interface LlmConfig {
  /** Provider base URL up to (not including) `/chat/completions`,
   *  e.g. `https://api.groq.com/openai/v1` or `http://127.0.0.1:11434/v1`. */
  baseUrl: string
  /** Provider-side model identifier, e.g. `llama-3.1-8b-instant`. */
  model: string
  apiKey: string
}

export interface LlmChatRequest {
  system: string
  user: string
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
}

/** Normalize a base URL into the chat-completions endpoint. Tolerates
 *  trailing slashes and a caller who pasted the full endpoint already. */
export function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  return trimmed.endsWith('/chat/completions') ? trimmed : `${trimmed}/chat/completions`
}

interface ChatCompletionsResponse {
  choices?: Array<{ message?: { content?: string } }>
}

/**
 * Single-turn completion. Throws on HTTP error, timeout, or empty payload —
 * callers (Brain.decide) already treat any throw as "no rationale this cycle".
 */
export async function chatComplete(cfg: LlmConfig, req: LlmChatRequest): Promise<string> {
  const res = await fetch(chatCompletionsUrl(cfg.baseUrl), {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${cfg.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: req.maxTokens ?? 90,
      temperature: req.temperature ?? 0.4,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    }),
    signal: AbortSignal.timeout(req.timeoutMs ?? LLM_TIMEOUT_MS),
  })
  if (!res.ok) {
    // Body is capped so a misbehaving provider can't flood the logs.
    const detail = (await res.text().catch(() => '')).slice(0, 300)
    throw new Error(`llm ${res.status} from ${cfg.model}: ${detail}`)
  }
  const json = await res.json() as ChatCompletionsResponse
  const text = (json.choices?.[0]?.message?.content ?? '').trim()
  if (!text) {
    log.warn('llm returned empty content', { model: cfg.model })
    throw new Error('llm returned empty content')
  }
  return text
}
