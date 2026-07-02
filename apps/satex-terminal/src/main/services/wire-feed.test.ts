import { describe, it, expect, vi } from 'vitest'
import { parseRssItems, decodeEntities, WireFeedService, type WireSource } from './wire-feed'

const RSS = (items: string) => `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${items}</channel></rss>`

const ITEM_PLAIN = `<item>
  <title>Quake of magnitude 6.1 strikes offshore</title>
  <link>https://news.example.com/quake</link>
  <pubDate>Wed, 10 Jun 2026 14:00:00 GMT</pubDate>
  <guid>quake-1</guid>
</item>`

const ITEM_CDATA = `<item>
  <title><![CDATA[Markets &amp; Mayors: a <strange> day]]></title>
  <link>https://news.example.com/mayors</link>
  <pubDate>Wed, 10 Jun 2026 15:30:00 GMT</pubDate>
</item>`

const ITEM_BROKEN = `<item><title>No link here</title><pubDate>garbage</pubDate></item>`

describe('decodeEntities', () => {
  it('decodes the common five plus numeric refs', () => {
    expect(decodeEntities('A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39; &#8212; f'))
      .toBe(`A & B <c> "d" 'e' — f`)
  })
})

describe('parseRssItems', () => {
  it('extracts title/link/date/guid and namespaces the id by source', () => {
    const items = parseRssItems(RSS(ITEM_PLAIN), 'bbc', 'BBC WORLD', 999)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'bbc:quake-1',
      sourceId: 'bbc',
      sourceLabel: 'BBC WORLD',
      title: 'Quake of magnitude 6.1 strikes offshore',
      link: 'https://news.example.com/quake',
      publishedAt: Date.parse('Wed, 10 Jun 2026 14:00:00 GMT'),
      fetchedAt: 999,
    })
  })

  it('handles CDATA titles, entity decoding, and falls back id→link / date→fetchedAt', () => {
    const items = parseRssItems(RSS(ITEM_CDATA), 'npr', 'NPR', 123)
    expect(items[0]!.title).toBe('Markets & Mayors: a <strange> day')
    expect(items[0]!.id).toBe('npr:https://news.example.com/mayors')
  })

  it('skips malformed items instead of throwing — one broken outlet must not dim the desk', () => {
    const items = parseRssItems(RSS(ITEM_BROKEN + ITEM_PLAIN), 'x', 'X', 1)
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe('x:quake-1')
  })

  it('falls back to fetchedAt when pubDate is unparseable', () => {
    const bad = `<item><title>T</title><link>https://a.b/c</link><pubDate>not a date</pubDate></item>`
    expect(parseRssItems(RSS(bad), 's', 'S', 777)[0]!.publishedAt).toBe(777)
  })
})

describe('WireFeedService', () => {
  const SRC: WireSource[] = [
    { id: 'a', label: 'ALPHA', url: 'https://a.example/rss' },
    { id: 'b', label: 'BETA',  url: 'https://b.example/rss' },
  ]

  function makeService(responses: Record<string, () => string>) {
    const fetchText = vi.fn(async (url: string) => {
      const fn = responses[url]
      if (!fn) throw new Error('unexpected url ' + url)
      return fn()
    })
    const svc = new WireFeedService({ fetchText, sources: SRC, pollMs: 60_000, now: () => 1_000_000 })
    return { svc, fetchText }
  }

  it('is OFF by default — no polling, no traffic', async () => {
    const { svc, fetchText } = makeService({})
    await svc.pollAll()
    expect(fetchText).not.toHaveBeenCalled()
    expect(svc.snapshot().enabled).toBe(false)
  })

  it('enable triggers an immediate fill; dedupe keeps repeat polls quiet', async () => {
    let calls = 0
    const { svc, fetchText } = makeService({
      'https://a.example/rss': () => { calls++; return RSS(ITEM_PLAIN) },
      'https://b.example/rss': () => RSS(ITEM_CDATA),
    })
    const snaps: number[] = []
    svc.onUpdate(s => snaps.push(s.items.length))

    svc.setEnabled(true)
    await vi.waitFor(() => expect(fetchText).toHaveBeenCalledTimes(2))
    await svc.pollAll()   // second poll, same content → dedupe, counts stable

    const snap = svc.snapshot()
    expect(snap.enabled).toBe(true)
    expect(snap.items).toHaveLength(2)
    expect(snap.items[0]!.publishedAt).toBeGreaterThanOrEqual(snap.items[1]!.publishedAt) // newest first
    expect(snap.sources.find(s => s.id === 'a')!.count).toBe(1)
    expect(calls).toBeGreaterThanOrEqual(2)
    svc.stop()
  })

  it('isolates a failing source: its tab dims, the rest stay live', async () => {
    const { svc, fetchText } = makeService({
      'https://a.example/rss': () => { throw new Error('503') },
      'https://b.example/rss': () => RSS(ITEM_PLAIN),
    })
    svc.setEnabled(true)
    await vi.waitFor(() => expect(fetchText).toHaveBeenCalledTimes(2))
    const snap = svc.snapshot()
    expect(snap.sources.find(s => s.id === 'a')!.status).toBe('error')
    expect(snap.sources.find(s => s.id === 'b')!.status).toBe('ok')
    expect(snap.items).toHaveLength(1)
    svc.stop()
  })

  it('disable stops the interval — toggle OFF means zero network', async () => {
    vi.useFakeTimers()
    try {
      const { svc, fetchText } = makeService({
        'https://a.example/rss': () => RSS(ITEM_PLAIN),
        'https://b.example/rss': () => RSS(ITEM_CDATA),
      })
      svc.setEnabled(true)
      await vi.advanceTimersByTimeAsync(10)         // flush the immediate poll
      const after = fetchText.mock.calls.length
      svc.setEnabled(false)
      await vi.advanceTimersByTimeAsync(10 * 60_000)  // 10 minutes pass
      expect(fetchText.mock.calls.length).toBe(after)
    } finally {
      vi.useRealTimers()
    }
  })
})
