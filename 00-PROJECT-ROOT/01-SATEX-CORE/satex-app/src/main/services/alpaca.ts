/**
 * SATEX — Alpaca Paper Trading Client
 * REST + WebSocket wrapper. Paper-only enforcement is load-bearing.
 * Every order submission verifies the configured baseUrl is the paper endpoint.
 *
 * REST (paper-api.alpaca.markets): account, positions, orders, clock
 * Data (data.alpaca.markets):      bars, snapshots
 * WS streams:
 *   wss://stream.data.alpaca.markets/v2/{iex|sip}  — market data ticks
 *   wss://paper-api.alpaca.markets/stream           — trade_updates
 */
import type { AlpacaTradeUpdate, Candle, OrderRequest, Position } from '@shared/types'
import { ALPACA_PAPER_HOST, findUniverseEntry } from '@shared/constants'
import { isLive } from './live-mode'
import { createLogger } from './logger'
import { ALPACA_RECONNECT, computeReconnectDelay } from './alpaca-reconnect'

const log = createLogger('alpaca')

export interface AlpacaConfig {
  keyId: string
  secretKey: string
  baseUrl: string
  dataUrl: string
  feed: 'iex' | 'sip'
}

export interface AlpacaAccountSnapshot {
  equity: number; cash: number; buyingPower: number; portfolioValue: number
  status: string; patternDayTrader: boolean; tradingBlocked: boolean; accountBlocked: boolean; daytradeCount: number
}

export interface AlpacaPosition {
  symbol: string; qty: number; avgEntryPrice: number; marketValue: number; unrealizedPl: number; side: 'long' | 'short'
}

export interface AlpacaClockSnapshot {
  timestamp: string; isOpen: boolean; nextOpen: string; nextClose: string
}

export interface AlpacaTick {
  symbol: string; price: number; size: number; bid: number; ask: number; timestamp: number
  /** Source frame type — 'q' = quote update (bid/ask depth change), 't' = trade
   *  print. Downstream code (LiveMarket volume/VWAP accumulator, footprint
   *  side inference) must skip non-trade frames so the metrics reflect actual
   *  trades, not quote-update churn. Pre-2026-05-18 every quote update was
   *  treated as a trade with size = bid_size + ask_size, inflating volume by
   *  ~10× and poisoning VWAP. */
  kind: 'q' | 't'
}

type WS = {
  send(data: string): void; close(code?: number): void; readonly readyState: number
  onopen: (() => void) | null; onclose: ((ev: { code: number; reason: string }) => void) | null
  onerror: ((ev: unknown) => void) | null; onmessage: ((ev: { data: string | ArrayBuffer | Buffer }) => void) | null
}
type TickHandler        = (tick: AlpacaTick) => void
type TradeUpdateHandler = (update: AlpacaTradeUpdate) => void

interface OrderResult { id: string; clientOrderId: string; status: string; filledQty: number; filledAvgPrice: number | null }

/** S1-3 — REST token bucket. Alpaca enforces 200 req/min per key on the trading
 *  endpoint. A reconnect storm (e.g., the 406-cooldown loop on a flaky network)
 *  can otherwise eat the budget invisibly until Alpaca returns 429s. The bucket
 *  fails closed (throws) when empty so callers see an explicit error rather
 *  than blocked-by-Alpaca silence. Soft-warns at <20% headroom, throttled to
 *  once per 10s so the warning stays readable. */
class AlpacaRateLimiter {
  private readonly capacity = 200
  private readonly windowMs = 60_000
  private tokens: number = 200
  private lastRefill: number = Date.now()
  private lastWarnAt = 0

  gate(label: string): void {
    this.refill()
    if (this.tokens < 1) {
      throw new Error(`alpaca rate limit (${this.capacity}/min) reached — ${label} blocked, retry in a moment`)
    }
    this.tokens -= 1
    if (this.tokens < this.capacity * 0.2) {
      const now = Date.now()
      if (now - this.lastWarnAt > 10_000) {
        this.lastWarnAt = now
        log.warn('alpaca rate-limit headroom low', {
          remaining: Math.floor(this.tokens), capacity: this.capacity, label,
        })
      }
    }
  }

  private refill(): void {
    const now = Date.now()
    const elapsed = Math.min(now - this.lastRefill, this.windowMs)
    if (elapsed <= 0) return
    const refillRate = this.capacity / this.windowMs
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * refillRate)
    this.lastRefill = now
  }

  /** Inspection helper — exposed for tests / future telemetry. */
  available(): number { this.refill(); return Math.floor(this.tokens) }
}

export class AlpacaClient {
  private cfg: AlpacaConfig
  private marketWs: WS | null = null
  private accountWs: WS | null = null
  /** Crypto data WebSocket (wss://stream.data.alpaca.markets/v1beta3/crypto/us).
   *  Separate from the equity feed — different endpoint, different symbol
   *  format (BTC/USD), and Alpaca counts it against a separate connection
   *  budget so both can run simultaneously without 406. */
  private cryptoWs: WS | null = null
  private cryptoSubscribed = new Set<string>()
  private subscribed = new Set<string>()
  private reconnectTimer: NodeJS.Timeout | null = null
  private acctReconnectTimer: NodeJS.Timeout | null = null
  /** Crypto WS reconnect timer guard (2026-05-26). Pre-fix, crypto's onclose
   *  scheduled a bare setTimeout without tracking the handle, so a flaky
   *  close+close sequence could schedule overlapping reconnects (every other
   *  fix this file has — equity, account — already guards with a timer ref). */
  private cryptoReconnectTimer: NodeJS.Timeout | null = null
  private tickListeners        = new Set<TickHandler>()
  private tradeUpdateListeners = new Set<TradeUpdateHandler>()
  private connected        = false
  private accountConnected = false
  private lastDataMessageAt = 0
  /** Exponential-backoff state for market-WS reconnects. Reset to 0 on
   *  successful authenticate; capped at MAX_BACKOFF_MS so we never sleep too
   *  long during a transient outage. */
  private reconnectAttempts = 0
  /** Separate backoff counters for the crypto + account WS reconnect paths.
   *  2026-05-18 — pre-fix crypto used a fixed 5s retry and account used 3s.
   *  Both could storm an unreachable endpoint at 12-20 req/min. Backoff
   *  matches the equity-feed shape so behavior is consistent across feeds. */
  private cryptoReconnectAttempts = 0
  private accountReconnectAttempts = 0
  private staleWatchdog: NodeJS.Timeout | null = null
  /** Absolute deadline before which reconnect attempts must wait. Set when the
   *  server reports code 406 (connection-limit exceeded) so an orphan socket on
   *  the server side has time to time out before we try to grab the slot. */
  private connectionLimitCooldownUntil = 0
  private static STALE_THRESHOLD_MS = 60_000   // force reconnect if no msg in 60s
  // Reconnect-backoff + 406-cooldown timing lives in ALPACA_RECONNECT
  // (alpaca-reconnect.ts); kept there as a pure module so all three feeds
  // share one source of truth and the math is unit-testable.
  /** S1-3 — per-key REST rate limiter. Trading + data endpoints share the
   *  same 200/min budget, so one bucket gates both `rest()` and `getBars()`. */
  private readonly rateLimiter = new AlpacaRateLimiter()

  constructor(cfg: AlpacaConfig) { this.cfg = cfg }

  // ── D6 (2026-05-18) — WS boundary input validation ──────────────────────
  // A compromised upstream proxy / MITM can deliver crafted JSON. The frame()
  // parser only narrows the JSON Value; downstream Number(...) and
  // new Date(...).getTime() return NaN on invalid input. NaN then poisons
  // q.volume / q.vwapNumer permanently AND makes refPriceAge NaN — which
  // causes order-manager Gate 0 to FAIL OPEN (NaN > MAX_QUOTE_AGE_MS is
  // false). These helpers replace every Number() and Date.getTime() in the
  // hot path so NaN cannot escape this boundary.
  private num(v: unknown, dflt = 0): number {
    const n = Number(v ?? dflt)
    return Number.isFinite(n) ? n : dflt
  }
  private ts(v: unknown): number {
    if (!v) return Date.now()
    const t = new Date(String(v)).getTime()
    return Number.isFinite(t) ? t : Date.now()
  }
  /** Symbol length cap matches ipc-schemas SymbolS.max(16). A 100MB symbol
   *  string in a hostile frame would otherwise become a Map key and balloon
   *  process memory. */
  private sym(v: unknown): string {
    return String(v ?? '').slice(0, 16)
  }

  get isPaperEndpoint():   boolean { return this.cfg.baseUrl.includes(ALPACA_PAPER_HOST) }
  get isConfigured():      boolean { return !!this.cfg.keyId && !!this.cfg.secretKey }
  get isMarketConnected(): boolean { return this.connected }
  get isAccountConnected():boolean { return this.accountConnected }
  get msSinceLastTick():   number  { return this.lastDataMessageAt === 0 ? Infinity : Date.now() - this.lastDataMessageAt }
  get subscribedSymbols(): string[] { return Array.from(this.subscribed) }
  /** Live status of the crypto data feed (separate from the equity WS). True
   *  once Alpaca has confirmed the subscription frame for at least one symbol;
   *  becomes false when the socket closes or hasn't yet authenticated. */
  get isCryptoConnected():     boolean { return this.cryptoWs !== null && this.cryptoSubscribed.size > 0 }
  get cryptoSubscribedCount(): number  { return this.cryptoSubscribed.size }

  private headers(): Record<string, string> {
    return { 'APCA-API-KEY-ID': this.cfg.keyId, 'APCA-API-SECRET-KEY': this.cfg.secretKey, 'Content-Type': 'application/json' }
  }

  /** 2026-05-18 — 10s timeout on every Alpaca REST call. Pre-fix fetch had
   *  no AbortSignal; a hung endpoint would stall syncAlpacaAccount (15s
   *  interval) and pile up overlapping fetches. Picked 10s as a value that
   *  surfaces a slow Alpaca without false-positive timeouts on normal slow
   *  responses. */
  private static REST_TIMEOUT_MS = 10_000

  private async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.isConfigured) throw new Error('alpaca: missing credentials')
    this.rateLimiter.gate(`${method} ${path}`)
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method, headers: this.headers(),
      signal: AbortSignal.timeout(AlpacaClient.REST_TIMEOUT_MS),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    })
    if (!res.ok) throw new Error(`alpaca ${method} ${path} → ${res.status}: ${await res.text()}`)
    return res.json() as Promise<T>
  }

  async getAccount(): Promise<AlpacaAccountSnapshot> {
    const r = await this.rest<Record<string, string | boolean | number>>('GET', '/v2/account')
    return {
      equity: +r['equity']!, cash: +r['cash']!, buyingPower: +r['buying_power']!,
      portfolioValue: +r['portfolio_value']!, status: String(r['status']),
      patternDayTrader: !!r['pattern_day_trader'], tradingBlocked: !!r['trading_blocked'],
      accountBlocked: !!r['account_blocked'], daytradeCount: +r['daytrade_count']!,
    }
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    const rows = await this.rest<Array<Record<string, string>>>('GET', '/v2/positions')
    return rows.map(r => ({
      symbol: r['symbol']!, qty: +r['qty']!, avgEntryPrice: +r['avg_entry_price']!,
      marketValue: +r['market_value']!, unrealizedPl: +r['unrealized_pl']!,
      side: r['side'] as 'long' | 'short',
    }))
  }

  async getClock(): Promise<AlpacaClockSnapshot> {
    const r = await this.rest<Record<string, string | boolean>>('GET', '/v2/clock')
    return { timestamp: String(r['timestamp']), isOpen: !!r['is_open'], nextOpen: String(r['next_open']), nextClose: String(r['next_close']) }
  }

  async submitOrder(req: OrderRequest): Promise<OrderResult> {
    // Live-endpoint guard. Pre-2026-05-13 this was an unconditional hard-block
    // ("never submit if not paper"). Phase 4 lifts the block when — and ONLY
    // when — the user has armed the typed-phrase interlock via live-mode.ts.
    //
    // Other safety walls remain in place upstream:
    //   • OrderManager Gate 7 enforces a per-order notional cap.
    //   • Gates 0-6, 8 (freshness, kill switch, market-hours, daily-loss,
    //     concentration, buying power, tactics) all still run before this.
    // This guard is the LAST line — orders that survive everything else still
    // get rejected here if interlock is not armed.
    if (!this.isPaperEndpoint && !isLive()) {
      throw new Error('Live trading requires explicit consent — arm the typed-phrase interlock first (Markets → ● LIVE mode).')
    }
    if (!this.isPaperEndpoint) {
      // Loud, structured log every time real capital is about to move. Easy to
      // grep for in audit logs (`level:warn ns:alpaca msg:"LIVE submit"`).
      log.warn('LIVE submit', { symbol: req.symbol, side: req.side, qty: req.quantity, type: req.type, hasStops: req.stopLoss !== undefined })
    }
    const body: Record<string, unknown> = {
      symbol: req.symbol, qty: req.quantity, side: req.side, type: req.type, time_in_force: 'day'
    }
    if (req.type === 'limit' && req.limitPrice !== undefined) body['limit_price'] = req.limitPrice
    if (req.stopLoss !== undefined) {
      body['order_class'] = 'bracket'
      body['stop_loss'] = { stop_price: req.stopLoss }
      if (req.takeProfit !== undefined) body['take_profit'] = { limit_price: req.takeProfit }
    }
    const r = await this.rest<Record<string, string | null>>('POST', '/v2/orders', body)
    return {
      id: String(r['id']), clientOrderId: String(r['client_order_id']),
      status: String(r['status']), filledQty: +(r['filled_qty'] ?? 0),
      filledAvgPrice: r['filled_avg_price'] != null ? +r['filled_avg_price'] : null,
    }
  }

  async cancelOrder(id: string): Promise<void> { await this.rest<void>('DELETE', `/v2/orders/${id}`) }

  async getBars(symbol: string, tf: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day', startIso: string, endIso?: string): Promise<Candle[]> {
    if (!this.isConfigured) throw new Error('alpaca: missing credentials')
    this.rateLimiter.gate(`GET /v2/stocks/${symbol}/bars`)
    const p = new URLSearchParams({ timeframe: tf, start: startIso, limit: '10000' })
    if (endIso) p.set('end', endIso)
    const res = await fetch(`${this.cfg.dataUrl}/v2/stocks/${symbol}/bars?${p}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(AlpacaClient.REST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`alpaca getBars ${symbol} → ${res.status}: ${await res.text()}`)
    const data = await res.json() as { bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> }
    return (data.bars ?? []).map(b => ({
      time: Math.floor(new Date(b.t).getTime() / 1000),
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }))
  }

  /** Latest prices for an arbitrary symbol mix, dispatching stocks vs crypto
   *  to their respective Alpaca endpoints in parallel. Returns a Map keyed by
   *  the BARE symbol (BTC, not BTC/USD) so callers can join against UNIVERSE
   *  without unpairing. Best-effort: a fetch failure on one branch leaves the
   *  other branch's results in the map. No-creds returns an empty map without
   *  hitting the network. Used by the engine's seed-hydration step
   *  (2026-05-26) so the simulator boots from realistic prices instead of the
   *  hardcoded UNIVERSE.seed values. */
  async getLatestPrices(symbols: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    if (!this.isConfigured) return out
    if (symbols.length === 0) return out

    const stocks: string[] = []
    const crypto: string[] = []
    for (const raw of symbols) {
      const sym = raw.trim().toUpperCase()
      if (sym.length === 0) continue
      const entry = findUniverseEntry(sym)
      if (entry?.assetClass === 'crypto') crypto.push(sym)
      else stocks.push(sym)
    }

    await Promise.all([
      stocks.length > 0 ? this.fetchStockSnapshots(stocks, out).catch(err =>
        log.warn('seed hydration stocks branch failed', { err: String(err) })
      ) : Promise.resolve(),
      crypto.length > 0 ? this.fetchCryptoLatestTrades(crypto, out).catch(err =>
        log.warn('seed hydration crypto branch failed', { err: String(err) })
      ) : Promise.resolve(),
    ])

    return out
  }

  private async fetchStockSnapshots(symbols: string[], out: Map<string, number>): Promise<void> {
    this.rateLimiter.gate('GET /v2/stocks/snapshots')
    const p = new URLSearchParams({ symbols: symbols.join(',') })
    const res = await fetch(`${this.cfg.dataUrl}/v2/stocks/snapshots?${p}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(AlpacaClient.REST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`alpaca getLatestPrices stocks → ${res.status}: ${await res.text()}`)
    const data = await res.json() as {
      snapshots?: Record<string, {
        latestTrade?: { p?: number }
        latestQuote?: { bp?: number; ap?: number }
      }>
    }
    for (const [sym, snap] of Object.entries(data.snapshots ?? {})) {
      const trade = snap.latestTrade?.p
      if (typeof trade === 'number' && Number.isFinite(trade) && trade > 0) {
        out.set(sym, trade); continue
      }
      const bp = snap.latestQuote?.bp ?? 0
      const ap = snap.latestQuote?.ap ?? 0
      if (Number.isFinite(bp) && Number.isFinite(ap) && bp > 0 && ap > 0) {
        out.set(sym, (bp + ap) / 2)
      }
    }
  }

  private async fetchCryptoLatestTrades(symbols: string[], out: Map<string, number>): Promise<void> {
    const pairs = symbols.map(s => `${s}/USD`)
    this.rateLimiter.gate('GET /v1beta3/crypto/us/latest/trades')
    const p = new URLSearchParams({ symbols: pairs.join(',') })
    const res = await fetch(`${this.cfg.dataUrl}/v1beta3/crypto/us/latest/trades?${p}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(AlpacaClient.REST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`alpaca getLatestPrices crypto → ${res.status}: ${await res.text()}`)
    const data = await res.json() as { trades?: Record<string, { p?: number }> }
    for (const [pair, t] of Object.entries(data.trades ?? {})) {
      const base = pair.split('/')[0] ?? pair
      const price = t.p
      if (typeof price === 'number' && Number.isFinite(price) && price > 0) {
        out.set(base, price)
      }
    }
  }

  /** Crypto historical bars via Alpaca's v1beta3 endpoint. Mirrors `getBars`
   *  but talks to /v1beta3/crypto/us/bars, which uses a slash-paired symbol
   *  format (BTC → BTC/USD) and returns a `bars` map keyed by that pair —
   *  not a flat array. USD is the only quote we trade and matches the WS
   *  crypto subscription format (`cryptoWs` uses BTC/USD too). Shares the
   *  same 200/min rate-limit bucket as the stock endpoint. */
  async getCryptoBars(symbol: string, tf: '1Min' | '5Min' | '15Min' | '1Hour' | '1Day', startIso: string, endIso?: string): Promise<Candle[]> {
    if (!this.isConfigured) throw new Error('alpaca: missing credentials')
    const pair = `${symbol.trim().toUpperCase()}/USD`
    this.rateLimiter.gate(`GET /v1beta3/crypto/us/bars ${pair}`)
    const p = new URLSearchParams({ symbols: pair, timeframe: tf, start: startIso, limit: '10000' })
    if (endIso) p.set('end', endIso)
    const res = await fetch(`${this.cfg.dataUrl}/v1beta3/crypto/us/bars?${p}`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(AlpacaClient.REST_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`alpaca getCryptoBars ${pair} → ${res.status}: ${await res.text()}`)
    const data = await res.json() as { bars?: Record<string, Array<{ t: string; o: number; h: number; l: number; c: number; v: number }>> }
    const raw = (data.bars ?? {})[pair] ?? []
    return raw.map(b => ({
      time: Math.floor(new Date(b.t).getTime() / 1000),
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }))
  }

  /**
   * Filter symbols for a given Alpaca data feed.
   *
   * IEX (free tier) covers only US equities + index ETFs. Subscribing to
   * futures / crypto on IEX causes the v2 stream to close with code 1006
   * — that's the reconnect-storm root cause we hit during smoke testing.
   *
   * SIP (paid) covers all US-listed equities. Crypto/futures still aren't
   * on the equity stream — those would need /crypto/{exchange} endpoints.
   */
  private subscribableSymbols(symbols: string[]): string[] {
    return symbols.filter(sym => {
      const entry = findUniverseEntry(sym)
      const cls = entry?.assetClass ?? 'equity'
      // Equity feeds cover equity + index ETFs only.
      return cls === 'equity' || cls === 'index'
    })
  }

  // ── Market Data WebSocket ─────────────────────────────────────────────────
  async connectMarketStream(symbols: string[]): Promise<void> {
    if (!this.isConfigured) { log.warn('skipping market stream — no credentials'); return }
    if (this.marketWs) return
    const subscribable = this.subscribableSymbols(symbols)
    const skipped = symbols.length - subscribable.length
    if (subscribable.length === 0) {
      log.warn('no subscribable symbols for feed — refusing to open WS', { feed: this.cfg.feed, total: symbols.length })
      return
    }
    const url = `wss://stream.data.alpaca.markets/v2/${this.cfg.feed}`
    log.info('connecting market WS', { url, symbols: subscribable.length, skipped, feed: this.cfg.feed })
    const ws = await openWS(url)
    if (!ws) { log.error('no WS implementation — market stream unavailable'); return }
    this.marketWs = ws

    ws.onopen = () => ws.send(JSON.stringify({ action: 'auth', key: this.cfg.keyId, secret: this.cfg.secretKey }))
    ws.onmessage = (ev) => { const f = frame(ev.data); if (f) for (const m of f) this.onDataMsg(m, subscribable) }
    ws.onclose = (ev) => {
      log.warn('market WS closed', { code: ev.code })
      this.connected = false; this.marketWs = null
      this.scheduleReconnect(symbols)
    }
    ws.onerror = (e) => log.error('market WS error', { err: String(e) })
  }

  disconnectMarketStream(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    if (this.staleWatchdog)  { clearInterval(this.staleWatchdog);  this.staleWatchdog  = null }
    try { this.marketWs?.close() } catch { /* ignore */ }
    this.marketWs = null; this.connected = false
    this.reconnectAttempts = 0
  }

  /**
   * Reconnect with exponential backoff: 1s, 2s, 4s, 8s, 16s, then capped at
   * MAX_BACKOFF_MS. Reset on successful auth. Honors a 406 cooldown so we
   * don't storm back through a slot we just lost. Delay math lives in the
   * pure `computeReconnectDelay` helper — same math for all three feeds.
   */
  private scheduleReconnect(symbols: string[]): void {
    if (this.reconnectTimer) return
    const nowMs = Date.now()
    const delay = computeReconnectDelay({
      attempts: this.reconnectAttempts,
      cooldownUntilMs: this.connectionLimitCooldownUntil,
      nowMs,
    })
    const cooldownMs = Math.max(0, this.connectionLimitCooldownUntil - nowMs)
    this.reconnectAttempts++
    log.info('scheduling market WS reconnect', {
      attempt: this.reconnectAttempts,
      delayMs: delay,
      ...(cooldownMs > 0 ? { cooldownMs } : {}),
    })
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connectMarketStream(symbols)
    }, delay)
  }

  /**
   * Watchdog: if no message has arrived in STALE_THRESHOLD_MS, force-close the
   * socket so scheduleReconnect can rebuild it. Runs at 1/4 the stale window
   * so detection latency is bounded.
   */
  private startStaleWatchdog(symbols: string[]): void {
    if (this.staleWatchdog) return
    const period = Math.max(5_000, Math.floor(AlpacaClient.STALE_THRESHOLD_MS / 4))
    this.staleWatchdog = setInterval(() => {
      if (!this.marketWs || !this.connected) return
      const idle = Date.now() - this.lastDataMessageAt
      if (this.lastDataMessageAt > 0 && idle > AlpacaClient.STALE_THRESHOLD_MS) {
        log.warn('market WS stale — forcing reconnect', { idleMs: idle })
        try { this.marketWs.close(4000) } catch { /* ignore */ }
        // close handler will call scheduleReconnect(symbols)
      }
    }, period)
    // Save symbols closure target via outer scope; clearing handled in disconnect.
    void symbols
  }

  private onDataMsg(m: Record<string, unknown>, symbols: string[]): void {
    this.lastDataMessageAt = Date.now()
    if (m['T'] === 'success' && m['msg'] === 'authenticated') {
      this.connected = true
      this.reconnectAttempts = 0                 // reset backoff on success
      this.startStaleWatchdog(symbols)
      log.info('market stream authenticated')
      this.marketWs?.send(JSON.stringify({ action: 'subscribe', trades: symbols, quotes: symbols, bars: symbols }))
      this.subscribed = new Set(symbols); return
    }
    // Error messages from Alpaca's stream protocol — surface them so we can
    // diagnose subscription/auth issues. Without this, a 1006 close right
    // after "subscription confirmed" looks identical to a network blip.
    if (m['T'] === 'error') {
      const code = Number(m['code'] ?? 0)
      log.warn('market stream error from server', { code, msg: m['msg'] })
      // Code 406 = "connection limit exceeded" — Alpaca only allows 1 concurrent
      // WS to the IEX feed per account. Pile-driving reconnects makes it worse;
      // apply a long cooldown so the orphan socket can time out server-side.
      if (code === 406) {
        this.connectionLimitCooldownUntil = Date.now() + ALPACA_RECONNECT.CONNECTION_LIMIT_COOLDOWN_MS
        log.warn('alpaca connection limit hit (equity) — cooling down', {
          cooldownMs: ALPACA_RECONNECT.CONNECTION_LIMIT_COOLDOWN_MS,
        })
      }
      return
    }
    if (m['T'] === 'subscription') {
      const t = (m['trades'] as unknown[])?.length ?? 0
      const q = (m['quotes'] as unknown[])?.length ?? 0
      const b = (m['bars']   as unknown[])?.length ?? 0
      log.info('subscription confirmed', { trades: t, quotes: q, bars: b })
      return
    }
    if (m['T'] === 'q') {
      // D6 — all numeric coercions through this.num(); timestamp through
      // this.ts(); symbol through this.sym() to length-cap.
      const bid = this.num(m['bp']), ask = this.num(m['ap'])
      // size is bid_size + ask_size (top-of-book depth, NOT traded size).
      // Carried for any consumer that wants book depth; LiveMarket gates volume
      // on kind === 't' so this doesn't leak into traded-volume metrics.
      const tick: AlpacaTick = {
        symbol: this.sym(m['S']),
        price: (bid + ask) / 2,
        size: this.num(m['bs']) + this.num(m['as']),
        bid, ask,
        timestamp: this.ts(m['t']),
        kind: 'q',
      }
      for (const l of this.tickListeners) l(tick); return
    }
    if (m['T'] === 't') {
      const price = this.num(m['p'])
      // 2026-05-18 (B2) — bid/ask sentinel 0 on trade frames. Trade prints
      // carry NO quote-book data; pre-fix we cloned price into bid+ask, which
      // collapsed the LiveMarket spread to 0 on every trade and re-expanded it
      // on the next quote frame (10×/sec flicker). LiveMarket's OR-fallback
      // chain (`q.bid = tick.bid || q.bid || q.last * 0.9999`) preserves the
      // prior quote when tick.bid is 0/falsy, eliminating the flicker.
      // D6 — coerce through num()/ts()/sym() so NaN/Infinity/huge-string
      // payloads can't poison downstream state.
      const tick: AlpacaTick = {
        symbol: this.sym(m['S']),
        price, size: this.num(m['s']),
        bid: 0, ask: 0,
        timestamp: this.ts(m['t']),
        kind: 't',
      }
      for (const l of this.tickListeners) l(tick); return
    }
  }

  onTick(fn: TickHandler): () => void { this.tickListeners.add(fn); return () => this.tickListeners.delete(fn) }

  // ── Crypto Market Data WebSocket (parallel to the equity feed) ───────────
  /** Connect to Alpaca's crypto data feed. `symbols` may be SATEX-style
   *  (`BTC`, `ETH`) or already-paired (`BTC/USD`); we normalize to the paired
   *  form Alpaca expects. Quotes/trades flow through the same `tickListeners`
   *  with the *base* symbol (so downstream code keeps using `BTC`). */
  async connectCryptoStream(symbols: string[]): Promise<void> {
    if (!this.isConfigured) { log.warn('skipping crypto stream — no credentials'); return }
    if (this.cryptoWs) return
    if (symbols.length === 0) return
    const paired = symbols.map(s => s.includes('/') ? s : `${s}/USD`)
    const url = 'wss://stream.data.alpaca.markets/v1beta3/crypto/us'
    log.info('connecting crypto WS', { url, symbols: paired.length })
    const ws = await openWS(url)
    if (!ws) { log.error('no WS implementation — crypto stream unavailable'); return }
    this.cryptoWs = ws

    ws.onopen = () => ws.send(JSON.stringify({ action: 'auth', key: this.cfg.keyId, secret: this.cfg.secretKey }))
    ws.onmessage = (ev) => { const f = frame(ev.data); if (f) for (const m of f) this.onCryptoDataMsg(m, paired) }
    ws.onclose = (ev) => {
      log.warn('crypto WS closed', { code: ev.code })
      this.cryptoWs = null
      if (this.cryptoReconnectTimer) return  // already scheduled — avoid stacking timers on rapid close+close
      // 2026-05-18 — exponential backoff matching the equity feed (1s, 2s,
      // 4s, 8s, 16s, capped at MAX_BACKOFF_MS). Pre-fix was a fixed 5s
      // retry that would storm an unreachable endpoint at 12 req/min for
      // the duration of an outage. 2026-05-26 — extracted to a shared helper
      // + now honors the 406 cooldown set by onCryptoDataMsg. Counter resets
      // on successful subscribe in onCryptoDataMsg.
      const nowMs = Date.now()
      const delay = computeReconnectDelay({
        attempts: this.cryptoReconnectAttempts,
        cooldownUntilMs: this.connectionLimitCooldownUntil,
        nowMs,
      })
      const cooldownMs = Math.max(0, this.connectionLimitCooldownUntil - nowMs)
      this.cryptoReconnectAttempts++
      log.info('scheduling crypto WS reconnect', {
        attempt: this.cryptoReconnectAttempts,
        delayMs: delay,
        ...(cooldownMs > 0 ? { cooldownMs } : {}),
      })
      this.cryptoReconnectTimer = setTimeout(() => {
        this.cryptoReconnectTimer = null
        void this.connectCryptoStream(symbols)
      }, delay)
      this.cryptoReconnectTimer.unref?.()
    }
    ws.onerror = (e) => log.error('crypto WS error', { err: String(e) })
  }

  disconnectCryptoStream(): void {
    if (this.cryptoReconnectTimer) { clearTimeout(this.cryptoReconnectTimer); this.cryptoReconnectTimer = null }
    try { this.cryptoWs?.close() } catch { /* ignore */ }
    this.cryptoWs = null
    this.cryptoSubscribed.clear()
  }

  private onCryptoDataMsg(m: Record<string, unknown>, symbols: string[]): void {
    this.lastDataMessageAt = Date.now()
    if (m['T'] === 'success' && m['msg'] === 'authenticated') {
      log.info('crypto stream authenticated')
      this.cryptoWs?.send(JSON.stringify({ action: 'subscribe', quotes: symbols, trades: symbols }))
      this.cryptoSubscribed = new Set(symbols)
      this.cryptoReconnectAttempts = 0  // 2026-05-18 — reset backoff on success
      return
    }
    if (m['T'] === 'error') {
      const code = Number(m['code'] ?? 0)
      log.warn('crypto stream error from server', { code, msg: m['msg'] })
      // 2026-05-26 — crypto WS now honors the same 406 cooldown the equity
      // feed has had since v0.4.2. Without it, a connection-limit error on
      // crypto would burn through the exponential backoff inside the 60s
      // orphan-socket window and keep the limit pinned. The cooldownUntil
      // field is shared (Alpaca counts orphan sockets per-account), so a 406
      // on either feed slows BOTH reconnect schedules.
      if (code === 406) {
        this.connectionLimitCooldownUntil = Date.now() + ALPACA_RECONNECT.CONNECTION_LIMIT_COOLDOWN_MS
        log.warn('alpaca connection limit hit (crypto) — cooling down', {
          cooldownMs: ALPACA_RECONNECT.CONNECTION_LIMIT_COOLDOWN_MS,
        })
      }
      return
    }
    if (m['T'] === 'subscription') {
      const q = (m['quotes'] as unknown[])?.length ?? 0
      const t = (m['trades'] as unknown[])?.length ?? 0
      log.info('crypto subscription confirmed', { quotes: q, trades: t })
      return
    }
    if (m['T'] === 'q') {
      // D6 — sym() caps length; split() on a capped string is safe.
      const symPair = this.sym(m['S'])
      const base = symPair.split('/')[0] ?? symPair
      const bid = this.num(m['bp']), ask = this.num(m['ap'])
      const tick: AlpacaTick = {
        symbol: base,
        price: (bid + ask) / 2,
        size: this.num(m['bs']) + this.num(m['as']),
        bid, ask,
        timestamp: this.ts(m['t']),
        kind: 'q',
      }
      for (const l of this.tickListeners) l(tick)
      return
    }
    if (m['T'] === 't') {
      const symPair = this.sym(m['S'])
      const base = symPair.split('/')[0] ?? symPair
      const price = this.num(m['p'])
      // 2026-05-18 (B2) — bid/ask sentinel 0 on crypto trade frames. Same
      // rationale as the equity-feed handler above: trade prints carry no
      // quote-book data, and LiveMarket's OR-fallback preserves the prior
      // quote when these are 0. D6 — every coercion through num()/ts()/sym().
      const tick: AlpacaTick = {
        symbol: base,
        price, size: this.num(m['s']),
        bid: 0, ask: 0,
        timestamp: this.ts(m['t']),
        kind: 't',
      }
      for (const l of this.tickListeners) l(tick)
      return
    }
  }

  // ── Account WebSocket ─────────────────────────────────────────────────────
  async connectAccountStream(): Promise<void> {
    if (!this.isConfigured || this.accountWs) return
    const url = this.cfg.baseUrl.replace('https://', 'wss://') + '/stream'
    log.info('connecting account WS', { url })
    const ws = await openWS(url)
    if (!ws) return
    this.accountWs = ws
    ws.onopen = () => ws.send(JSON.stringify({ action: 'auth', key: this.cfg.keyId, secret: this.cfg.secretKey }))
    ws.onmessage = (ev) => { const f = frame(ev.data); if (f) for (const m of f) this.onAccountMsg(m as Record<string, unknown>) }
    ws.onclose = () => {
      this.accountConnected = false; this.accountWs = null
      if (this.acctReconnectTimer) return
      // 2026-05-18 — exponential backoff matching equity + crypto feeds.
      // Counter resets on successful authorize in onAccountMsg. Reads the
      // shared cooldownUntil — a 406 on the data WS slows account-WS retries
      // too (single account-wide orphan-socket budget on Alpaca's side).
      const delay = computeReconnectDelay({
        attempts: this.accountReconnectAttempts,
        cooldownUntilMs: this.connectionLimitCooldownUntil,
        nowMs: Date.now(),
      })
      this.accountReconnectAttempts++
      log.info('scheduling account WS reconnect', { attempt: this.accountReconnectAttempts, delayMs: delay })
      this.acctReconnectTimer = setTimeout(() => {
        this.acctReconnectTimer = null
        void this.connectAccountStream()
      }, delay)
    }
    ws.onerror = (e) => log.error('account WS error', { err: String(e) })
  }

  disconnectAccountStream(): void {
    if (this.acctReconnectTimer) { clearTimeout(this.acctReconnectTimer); this.acctReconnectTimer = null }
    try { this.accountWs?.close() } catch { /* ignore */ }
    this.accountWs = null; this.accountConnected = false
  }

  private onAccountMsg(m: Record<string, unknown>): void {
    if (m['stream'] === 'authorization') {
      this.accountConnected = true
      this.accountReconnectAttempts = 0  // 2026-05-18 — reset backoff on success
      this.accountWs?.send(JSON.stringify({ action: 'listen', data: { streams: ['trade_updates'] } })); return
    }
    if (m['stream'] === 'trade_updates' && m['data'] && typeof m['data'] === 'object') {
      const d = m['data'] as Record<string, unknown>
      const order = (d['order'] ?? {}) as Record<string, unknown>
      const update: AlpacaTradeUpdate = {
        event: String(d['event'] ?? '') as AlpacaTradeUpdate['event'],
        orderId: String(order['id'] ?? ''), symbol: String(order['symbol'] ?? ''),
        side: order['side'] === 'sell' ? 'sell' : 'buy',
        quantity: Number(order['qty'] ?? 0), filledQty: Number(order['filled_qty'] ?? 0),
        price: Number(d['price'] ?? order['filled_avg_price'] ?? 0),
        timestamp: d['timestamp'] ? new Date(String(d['timestamp'])).getTime() : Date.now(),
      }
      for (const l of this.tradeUpdateListeners) l(update)
    }
  }

  onTradeUpdate(fn: TradeUpdateHandler): () => void { this.tradeUpdateListeners.add(fn); return () => this.tradeUpdateListeners.delete(fn) }

  static toSatexPosition(p: AlpacaPosition, openedAt: number): Position {
    return {
      symbol: p.symbol, quantity: p.side === 'short' ? -Math.abs(p.qty) : Math.abs(p.qty),
      avgPrice: p.avgEntryPrice, unrealizedPnl: p.unrealizedPl, realizedPnl: 0, openedAt,
    }
  }
}

async function openWS(url: string): Promise<WS | null> {
  const G = globalThis as unknown as { WebSocket?: new (url: string) => WS }
  if (typeof G.WebSocket === 'function') {
    try { return new G.WebSocket(url) } catch (e) { log.warn('native WS failed', { err: String(e) }) }
  }
  try {
    const mod = await import('ws') as unknown as { default: new (url: string) => WS }
    return new mod.default(url)
  } catch (e) { log.error('no WS implementation', { err: String(e) }); return null }
}

function frame(data: string | ArrayBuffer | Buffer): Array<Record<string, unknown>> | null {
  const text = typeof data === 'string' ? data : Buffer.isBuffer(data) ? data.toString('utf8') : new TextDecoder().decode(data as ArrayBuffer)
  try { const p = JSON.parse(text); return Array.isArray(p) ? p : [p] } catch { return null }
}
