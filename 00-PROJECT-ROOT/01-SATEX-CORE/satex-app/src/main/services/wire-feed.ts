/**
 * SATEX — THE WIRE (2026-06-10, operator fun-challenge).
 *
 * A toggleable live world-news desk: real channels (BBC World, NPR, Guardian,
 * Hacker News) polled MAIN-side the moment they publish, streamed to the
 * renderer over the existing push pipeline. Deliberately not finance-only —
 * the operator asked for the world outside the tape.
 *
 * Architecture decisions (PSD'd inline):
 *   - RSS over vendor APIs: key-free, license-clean, every outlet has it.
 *   - MAIN-process fetch only: the renderer CSP allowlists zero news hosts
 *     (audit §3.6 precedent) — the wall stays intact.
 *   - Zero new dependencies: a 60-line pure parser beats a 2MB XML tree for
 *     title/link/date extraction, and it's unit-tested.
 *   - OFF by default; polling starts only when the operator flips the WIRE
 *     toggle in the News Desk — no background traffic uninvited.
 *   - Every fetch carries the house 10s AbortSignal budget (audit §3.1 rule).
 *
 * Strictly cosmetic to trading: THE WIRE never touches stores the engine
 * reads, never emits NewsItem catalysts, never gates anything.
 */
import type { WireItem, WireSnapshot, WireSourceStatus } from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('wire')

const WIRE_TIMEOUT_MS = 10_000
const POLL_MS = 60_000
/** Per-source ring cap; ALL-tab merge is capped at 4× this. */
const PER_SOURCE_CAP = 80
const PER_FETCH_PARSE_CAP = 30

export interface WireSource {
  id: string
  label: string
  url: string
}

/** The channel roster. Edit here to add a local reporter's RSS — the tabs,
 *  polling, and dedupe all derive from this array. */
const WIRE_SOURCES: ReadonlyArray<WireSource> = [
  { id: 'bbc',      label: 'BBC WORLD', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'npr',      label: 'NPR',       url: 'https://feeds.npr.org/1001/rss.xml' },
  { id: 'guardian', label: 'GUARDIAN',  url: 'https://www.theguardian.com/world/rss' },
  { id: 'hn',       label: 'HACKER NEWS', url: 'https://hnrss.org/frontpage' },
]

// ── Pure RSS parsing (exported for unit tests) ─────────────────────────────

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ',
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
}

function field(block: string, tag: string): string | null {
  // <tag>…</tag> with optional CDATA wrapper; non-greedy, case-insensitive.
  const re = new RegExp(`<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`, 'i')
  const m = block.match(re)
  if (!m) return null
  const raw = (m[1] ?? m[2] ?? '').trim()
  return raw.length > 0 ? raw : null
}

/** Extract items from an RSS 2.0 document. Tolerant by design: a malformed
 *  item is skipped, never thrown — one broken outlet must not dim the desk. */
export function parseRssItems(xml: string, sourceId: string, sourceLabel: string, fetchedAt: number): WireItem[] {
  const out: WireItem[] = []
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  for (const block of blocks.slice(0, PER_FETCH_PARSE_CAP)) {
    const title = field(block, 'title')
    const link = field(block, 'link')
    if (!title || !link || !/^https?:\/\//i.test(link)) continue
    const pubDateRaw = field(block, 'pubDate')
    const publishedAt = pubDateRaw ? Date.parse(pubDateRaw) : NaN
    const guid = field(block, 'guid')
    out.push({
      id: `${sourceId}:${guid ?? link}`,
      sourceId,
      sourceLabel,
      title: decodeEntities(title).slice(0, 300),
      link,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : fetchedAt,
      fetchedAt,
    })
  }
  return out
}

// ── Service ────────────────────────────────────────────────────────────────

export interface WireFeedDeps {
  /** Injected transport — tests stub it; prod wraps global fetch + timeout. */
  fetchText: (url: string) => Promise<string>
  now?: () => number
  sources?: ReadonlyArray<WireSource>
  pollMs?: number
}

export class WireFeedService {
  private enabled = false
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private readonly seen = new Set<string>()
  private readonly itemsBySource = new Map<string, WireItem[]>()
  private readonly sourceStatus = new Map<string, WireSourceStatus>()
  private readonly listeners = new Set<(snap: WireSnapshot) => void>()
  private readonly sources: ReadonlyArray<WireSource>
  private readonly pollMs: number

  constructor(private readonly deps: WireFeedDeps) {
    this.sources = deps.sources ?? WIRE_SOURCES
    this.pollMs = deps.pollMs ?? POLL_MS
    for (const s of this.sources) {
      this.itemsBySource.set(s.id, [])
      this.sourceStatus.set(s.id, { id: s.id, label: s.label, status: 'idle', lastFetchAt: null, count: 0 })
    }
  }

  onUpdate(fn: (snap: WireSnapshot) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Flip the desk on/off. ON triggers an immediate poll so the tabs fill
   *  within seconds; OFF stops all network activity (no background traffic
   *  when the operator doesn't want it). Idempotent. */
  setEnabled(enabled: boolean): WireSnapshot {
    if (enabled === this.enabled) return this.snapshot()
    this.enabled = enabled
    if (enabled) {
      log.info('wire enabled', { sources: this.sources.length, pollMs: this.pollMs })
      void this.pollAll()
      this.timer = setInterval(() => { void this.pollAll() }, this.pollMs)
      this.timer.unref?.()
    } else {
      log.info('wire disabled')
      if (this.timer) { clearInterval(this.timer); this.timer = null }
    }
    return this.snapshot()
  }

  stop(): void { this.setEnabled(false) }

  snapshot(): WireSnapshot {
    const merged: WireItem[] = []
    for (const items of this.itemsBySource.values()) merged.push(...items)
    merged.sort((a, b) => b.publishedAt - a.publishedAt)
    return {
      enabled: this.enabled,
      items: merged.slice(0, PER_SOURCE_CAP * 4),
      sources: this.sources.map(s => this.sourceStatus.get(s.id)!),
      generatedAt: this.deps.now?.() ?? Date.now(),
    }
  }

  /** One poll across all sources. Re-entrant-safe; per-source failures are
   *  isolated (status='error' dims that tab, the rest stay live). Public for
   *  tests and the enable-time immediate fill. */
  async pollAll(): Promise<void> {
    if (this.polling || !this.enabled) return
    this.polling = true
    let anyNew = false
    try {
      for (const src of this.sources) {
        const status = this.sourceStatus.get(src.id)!
        try {
          const fetchedAt = this.deps.now?.() ?? Date.now()
          const xml = await this.deps.fetchText(src.url)
          const parsed = parseRssItems(xml, src.id, src.label, fetchedAt)
          const ring = this.itemsBySource.get(src.id)!
          for (const item of parsed) {
            if (this.seen.has(item.id)) continue
            this.seen.add(item.id)
            ring.unshift(item)
            anyNew = true
          }
          if (ring.length > PER_SOURCE_CAP) ring.length = PER_SOURCE_CAP
          status.status = 'ok'
          status.lastFetchAt = fetchedAt
          status.count = ring.length
        } catch (e) {
          status.status = 'error'
          log.warn('wire source failed', { source: src.id, err: String(e) })
        }
      }
      // Bound the dedupe set: keep it proportional to what the rings hold.
      if (this.seen.size > PER_SOURCE_CAP * this.sources.length * 4) this.seen.clear()
    } finally {
      this.polling = false
    }
    if (anyNew || this.listeners.size > 0) {
      const snap = this.snapshot()
      for (const fn of this.listeners) {
        try { fn(snap) } catch (e) { log.warn('wire listener threw', { err: String(e) }) }
      }
    }
  }
}

/** Production transport: global fetch + the house 10s budget + an honest UA. */
export function defaultFetchText(url: string): Promise<string> {
  return fetch(url, {
    headers: { 'user-agent': 'SATEX-Wire/1.0 (+desktop terminal news desk)' },
    signal: AbortSignal.timeout(WIRE_TIMEOUT_MS),
  }).then(res => {
    if (!res.ok) throw new Error(`${res.status} from ${new URL(url).hostname}`)
    return res.text()
  })
}
