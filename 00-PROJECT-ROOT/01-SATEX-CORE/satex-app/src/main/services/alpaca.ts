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
import { ALPACA_PAPER_HOST } from '@shared/constants'
import { createLogger } from './logger'

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
}

type WS = {
  send(data: string): void; close(code?: number): void; readonly readyState: number
  onopen: (() => void) | null; onclose: ((ev: { code: number; reason: string }) => void) | null
  onerror: ((ev: unknown) => void) | null; onmessage: ((ev: { data: string | ArrayBuffer | Buffer }) => void) | null
}
type TickHandler        = (tick: AlpacaTick) => void
type TradeUpdateHandler = (update: AlpacaTradeUpdate) => void

interface OrderResult { id: string; clientOrderId: string; status: string; filledQty: number; filledAvgPrice: number | null }

export class AlpacaClient {
  private cfg: AlpacaConfig
  private marketWs: WS | null = null
  private accountWs: WS | null = null
  private subscribed = new Set<string>()
  private reconnectTimer: NodeJS.Timeout | null = null
  private acctReconnectTimer: NodeJS.Timeout | null = null
  private tickListeners        = new Set<TickHandler>()
  private tradeUpdateListeners = new Set<TradeUpdateHandler>()
  private connected        = false
  private accountConnected = false
  private lastDataMessageAt = 0

  constructor(cfg: AlpacaConfig) { this.cfg = cfg }

  get isPaperEndpoint():   boolean { return this.cfg.baseUrl.includes(ALPACA_PAPER_HOST) }
  get isConfigured():      boolean { return !!this.cfg.keyId && !!this.cfg.secretKey }
  get isMarketConnected(): boolean { return this.connected }
  get isAccountConnected():boolean { return this.accountConnected }
  get msSinceLastTick():   number  { return this.lastDataMessageAt === 0 ? Infinity : Date.now() - this.lastDataMessageAt }
  get subscribedSymbols(): string[] { return Array.from(this.subscribed) }

  private headers(): Record<string, string> {
    return { 'APCA-API-KEY-ID': this.cfg.keyId, 'APCA-API-SECRET-KEY': this.cfg.secretKey, 'Content-Type': 'application/json' }
  }

  private async rest<T>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.isConfigured) throw new Error('alpaca: missing credentials')
    const res = await fetch(`${this.cfg.baseUrl}${path}`, {
      method, headers: this.headers(),
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
    if (!this.isPaperEndpoint) throw new Error(`alpaca: refusing non-paper submit — baseUrl=${this.cfg.baseUrl}`)
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
    const p = new URLSearchParams({ timeframe: tf, start: startIso, limit: '10000' })
    if (endIso) p.set('end', endIso)
    const res = await fetch(`${this.cfg.dataUrl}/v2/stocks/${symbol}/bars?${p}`, { headers: this.headers() })
    if (!res.ok) throw new Error(`alpaca getBars ${symbol} → ${res.status}: ${await res.text()}`)
    const data = await res.json() as { bars?: Array<{ t: string; o: number; h: number; l: number; c: number; v: number }> }
    return (data.bars ?? []).map(b => ({
      time: Math.floor(new Date(b.t).getTime() / 1000),
      open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v,
    }))
  }

  // ── Market Data WebSocket ─────────────────────────────────────────────────
  async connectMarketStream(symbols: string[]): Promise<void> {
    if (!this.isConfigured) { log.warn('skipping market stream — no credentials'); return }
    if (this.marketWs) return
    const url = `wss://stream.data.alpaca.markets/v2/${this.cfg.feed}`
    log.info('connecting market WS', { url, symbols: symbols.length })
    const ws = await openWS(url)
    if (!ws) { log.error('no WS implementation — market stream unavailable'); return }
    this.marketWs = ws

    ws.onopen = () => ws.send(JSON.stringify({ action: 'auth', key: this.cfg.keyId, secret: this.cfg.secretKey }))
    ws.onmessage = (ev) => { const f = frame(ev.data); if (f) for (const m of f) this.onDataMsg(m, symbols) }
    ws.onclose = (ev) => {
      log.warn('market WS closed', { code: ev.code })
      this.connected = false; this.marketWs = null
      this.scheduleReconnect(symbols)
    }
    ws.onerror = (e) => log.error('market WS error', { err: String(e) })
  }

  disconnectMarketStream(): void {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
    try { this.marketWs?.close() } catch { /* ignore */ }
    this.marketWs = null; this.connected = false
  }

  private scheduleReconnect(symbols: string[]): void {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; void this.connectMarketStream(symbols) }, 3000)
  }

  private onDataMsg(m: Record<string, unknown>, symbols: string[]): void {
    this.lastDataMessageAt = Date.now()
    if (m['T'] === 'success' && m['msg'] === 'authenticated') {
      this.connected = true
      log.info('market stream authenticated')
      this.marketWs?.send(JSON.stringify({ action: 'subscribe', trades: symbols, quotes: symbols, bars: symbols }))
      this.subscribed = new Set(symbols); return
    }
    if (m['T'] === 'subscription') { log.info('subscription confirmed'); return }
    if (m['T'] === 'q') {
      const bid = Number(m['bp'] ?? 0), ask = Number(m['ap'] ?? 0)
      const tick: AlpacaTick = { symbol: String(m['S'] ?? ''), price: (bid + ask) / 2, size: Number(m['bs'] ?? 0) + Number(m['as'] ?? 0), bid, ask, timestamp: m['t'] ? new Date(String(m['t'])).getTime() : Date.now() }
      for (const l of this.tickListeners) l(tick); return
    }
    if (m['T'] === 't') {
      const price = Number(m['p'] ?? 0)
      const tick: AlpacaTick = { symbol: String(m['S'] ?? ''), price, size: Number(m['s'] ?? 0), bid: price, ask: price, timestamp: m['t'] ? new Date(String(m['t'])).getTime() : Date.now() }
      for (const l of this.tickListeners) l(tick); return
    }
  }

  onTick(fn: TickHandler): () => void { this.tickListeners.add(fn); return () => this.tickListeners.delete(fn) }

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
      if (!this.acctReconnectTimer) this.acctReconnectTimer = setTimeout(() => { this.acctReconnectTimer = null; void this.connectAccountStream() }, 3000)
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
