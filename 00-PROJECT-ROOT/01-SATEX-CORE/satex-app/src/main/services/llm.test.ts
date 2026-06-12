import { describe, it, expect, vi, afterEach } from 'vitest'
import { chatComplete, chatCompletionsUrl, LLM_TIMEOUT_MS } from './llm'

const CFG = { baseUrl: 'https://api.example.com/v1', model: 'test-model', apiKey: 'sk-test' }
const REQ = { system: 'sys', user: 'usr' }

function okResponse(content: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 })
}

afterEach(() => { vi.unstubAllGlobals() })

describe('chatCompletionsUrl', () => {
  it('appends /chat/completions to a clean base', () => {
    expect(chatCompletionsUrl('https://api.groq.com/openai/v1')).toBe('https://api.groq.com/openai/v1/chat/completions')
  })

  it('strips trailing slashes before appending', () => {
    expect(chatCompletionsUrl('http://127.0.0.1:11434/v1///')).toBe('http://127.0.0.1:11434/v1/chat/completions')
  })

  it('does not double-append when the full endpoint was pasted', () => {
    expect(chatCompletionsUrl('https://x.dev/v1/chat/completions')).toBe('https://x.dev/v1/chat/completions')
  })
})

describe('chatComplete', () => {
  it('POSTs an OpenAI-compatible body with bearer auth and a timeout signal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('  bullish drift  '))
    vi.stubGlobal('fetch', fetchMock)

    const out = await chatComplete(CFG, { ...REQ, maxTokens: 42, temperature: 0.1 })
    expect(out).toBe('bullish drift')  // trimmed

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer sk-test')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    const body = JSON.parse(init.body as string) as {
      model: string; max_tokens: number; temperature: number
      messages: Array<{ role: string; content: string }>
    }
    expect(body.model).toBe('test-model')
    expect(body.max_tokens).toBe(42)
    expect(body.temperature).toBe(0.1)
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ])
  })

  it('defaults max_tokens/temperature when omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse('x'))
    vi.stubGlobal('fetch', fetchMock)
    await chatComplete(CFG, REQ)
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as { max_tokens: number; temperature: number }
    expect(body.max_tokens).toBe(90)
    expect(body.temperature).toBe(0.4)
  })

  it('throws on non-2xx with status + capped detail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('rate limited '.repeat(100), { status: 429 })))
    await expect(chatComplete(CFG, REQ)).rejects.toThrow(/llm 429 from test-model/)
  })

  it('throws on empty content so callers fall back to no-rationale', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse('')))
    await expect(chatComplete(CFG, REQ)).rejects.toThrow(/empty content/)
  })

  it('propagates abort (timeout) rejections', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('The operation timed out.', 'TimeoutError')))
    await expect(chatComplete(CFG, REQ)).rejects.toThrow(/timed out/i)
  })

  it('exports a sane hard timeout constant', () => {
    expect(LLM_TIMEOUT_MS).toBe(10_000)
  })
})
