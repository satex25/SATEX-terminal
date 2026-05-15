/**
 * SATEX — SEC EDGAR Catalysts Service (Phase 10.2 · 2026-05-15)
 *
 * Polls the SEC's free public submissions endpoint for recent filings on the
 * symbols in the watchlist, converts them into NewsItems, and pushes them into
 * the existing news pipeline. No auth required; SEC mandates a User-Agent
 * header identifying the requester — we send a project string.
 *
 * Endpoints used (all under data.sec.gov, no API key):
 *   - https://www.sec.gov/files/company_tickers.json
 *       → static ticker→CIK map. Cached for 24h.
 *   - https://data.sec.gov/submissions/CIK{10-digit-padded}.json
 *       → recent filings per filer.
 *
 * Filtering: we surface 8-K (material events), 10-Q (quarterly), 10-K (annual),
 * and Form 4 (insider transactions). Pre-filter on filingDate within the last
 * 7 days at start, then incrementally per poll.
 *
 * Rate limiting: SEC asks for <=10 req/sec. With ~10 watchlist symbols per
 * 5-min poll = 0.033 req/sec, we're trivially under.
 */
import type { NewsItem, NewsKind } from '@shared/types'
import { shortId } from './id-generator'
import { createLogger } from './logger'

const log = createLogger('edgar')

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'
const SEC_SUBMISSIONS_URL = (cik: string) =>
  `https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`

/** Required by SEC. Identify yourself; they 403 unidentified clients. */
const USER_AGENT = 'SATEX Trading Terminal contact@satex.local'

/** Form types we surface in the Catalysts panel. */
const TRACKED_FORMS = new Set(['8-K', '10-Q', '10-K', '4', '4/A'])

/** Severity mapping per form type — drives NewsKind for the catalyst pill. */
const FORM_KIND: Record<string, NewsKind> = {
  '8-K':  'breaking',
  '10-Q': 'earnings',
  '10-K': 'earnings',
  '4':    'flow',
  '4/A':  'flow',
}

export type EdgarListener = (item: NewsItem) => void

interface TickerEntry {
  cik_str: number
  ticker:  string
  title:   string
}

interface SubmissionsRecent {
  accessionNumber: string[]
  filingDate:      string[]
  form:            string[]
  primaryDocument: string[]
  primaryDocDescription: string[]
}

export interface EdgarServiceDeps {
  /** Returns current watchlist symbols. */
  getWatchlist: () => string[]
}

export class EdgarService {
  private readonly deps: EdgarServiceDeps
  private listeners = new Set<EdgarListener>()
  private cikMap = new Map<string, { cik: string; name: string }>()
  private cikMapFetchedAt = 0
  /** Set of accession numbers we've already pushed — prevents duplicate news. */
  private seen = new Set<string>()
  private timer: NodeJS.Timeout | null = null
  /** Poll cadence: 5 min in production, set lower for testing if needed. */
  private static POLL_MS = 5 * 60_000
  /** Lookback on first run — surface any 8-K/10-Q from the past week. */
  private static INITIAL_LOOKBACK_DAYS = 7

  constructor(deps: EdgarServiceDeps) {
    this.deps = deps
  }

  onNews(fn: EdgarListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  start(): void {
    if (this.timer) return
    // First poll runs ~10s after start so we don't compete with engine boot.
    setTimeout(() => void this.poll(), 10_000)
    this.timer = setInterval(() => void this.poll(), EdgarService.POLL_MS)
    log.info('edgar service started', { pollMinutes: EdgarService.POLL_MS / 60_000 })
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  /** Force one poll cycle. Useful for manual refresh or testing. */
  async refresh(): Promise<void> {
    await this.poll()
  }

  private async poll(): Promise<void> {
    try {
      await this.ensureCikMap()
      const symbols = this.deps.getWatchlist()
      if (symbols.length === 0) return
      const cutoff = new Date(Date.now() - EdgarService.INITIAL_LOOKBACK_DAYS * 86400_000)
      let pushed = 0
      for (const sym of symbols) {
        const entry = this.cikMap.get(sym)
        if (!entry) continue
        const filings = await this.fetchSubmissions(entry.cik)
        for (const f of filings) {
          if (this.seen.has(f.accessionNumber)) continue
          if (!TRACKED_FORMS.has(f.form)) continue
          const filed = new Date(f.filingDate)
          if (Number.isNaN(filed.getTime()) || filed < cutoff) continue
          this.seen.add(f.accessionNumber)
          this.emit(sym, entry.name, f)
          pushed++
        }
      }
      // Keep the seen-set bounded — once it exceeds 5k entries, drop oldest half.
      if (this.seen.size > 5000) {
        const arr = Array.from(this.seen)
        this.seen = new Set(arr.slice(arr.length / 2))
      }
      if (pushed > 0) log.info('edgar poll complete', { symbols: symbols.length, newFilings: pushed })
    } catch (e) {
      log.warn('edgar poll failed', { err: String(e) })
    }
  }

  private async ensureCikMap(): Promise<void> {
    // Refresh ticker→CIK map once a day. Static-ish data; lookup-only file.
    if (this.cikMap.size > 0 && Date.now() - this.cikMapFetchedAt < 86400_000) return
    const res = await fetch(SEC_TICKERS_URL, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) throw new Error(`SEC tickers fetch failed: ${res.status}`)
    const json = await res.json() as Record<string, TickerEntry>
    this.cikMap.clear()
    for (const v of Object.values(json)) {
      this.cikMap.set(v.ticker.toUpperCase(), { cik: String(v.cik_str), name: v.title })
    }
    this.cikMapFetchedAt = Date.now()
    log.info('edgar ticker map refreshed', { entries: this.cikMap.size })
  }

  private async fetchSubmissions(cik: string): Promise<Array<{
    accessionNumber: string; filingDate: string; form: string; primaryDocument: string; description: string
  }>> {
    const url = SEC_SUBMISSIONS_URL(cik)
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!res.ok) {
      // 404 is common for delisted / non-filing tickers; quiet warn.
      if (res.status === 404) return []
      throw new Error(`SEC submissions ${cik} → ${res.status}`)
    }
    const json = await res.json() as { filings?: { recent?: SubmissionsRecent } }
    const recent = json.filings?.recent
    if (!recent) return []
    const out: Array<{ accessionNumber: string; filingDate: string; form: string; primaryDocument: string; description: string }> = []
    const n = Math.min(recent.accessionNumber.length, 20)  // last 20 per ticker is plenty
    for (let i = 0; i < n; i++) {
      out.push({
        accessionNumber: recent.accessionNumber[i] ?? '',
        filingDate:      recent.filingDate[i] ?? '',
        form:            recent.form[i] ?? '',
        primaryDocument: recent.primaryDocument[i] ?? '',
        description:     recent.primaryDocDescription[i] ?? '',
      })
    }
    return out
  }

  private emit(symbol: string, name: string, f: { accessionNumber: string; filingDate: string; form: string; description: string }): void {
    const kind = FORM_KIND[f.form] ?? 'sentiment'
    const sentiment = f.form === '4' || f.form === '4/A' ? 0 : f.form === '8-K' ? -0.1 : 0.05
    const title = `${symbol} · ${f.form}${f.description ? ` — ${f.description}` : ''}`
    const summary = `${name} · SEC ${f.form} filed ${f.filingDate} · accession ${f.accessionNumber}`
    const item: NewsItem = {
      id: shortId('edgar'),
      source: 'SEC/EDGAR',
      kind,
      symbol,
      title,
      summary,
      sentiment,
      publishedAt: new Date(f.filingDate).getTime() || Date.now(),
    }
    for (const fn of this.listeners) fn(item)
  }
}
