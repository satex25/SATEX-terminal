/**
 * SATEX — Trading Engine (Main Process Orchestrator)
 * Owns all service instances and their lifecycle. Exposes a clean API for
 * main/index.ts to call without knowing service internals.
 *
 * Boot sequence:
 *   1. loadEnv() — read + validate environment
 *   2. Build AlpacaClient or null
 *   3. Choose MarketSimulator or LiveMarket
 *   4. Instantiate OrderManager, Persistence
 *   5. Start data feed
 *   6. Register IPC → engine method wiring (done in main/index.ts)
 */
import { getEnv } from '../services/env'
import { AlpacaClient } from '../services/alpaca'
import type { AlpacaConfig } from '../services/alpaca'
import { MarketSimulator, type MarketDataSource } from '../services/market-data'
import { LiveMarket } from '../services/live-market'
import { OrderManager, type OrderValidationContext } from '../services/order-manager'
import { computeSnapshot } from '@shared/indicators'
import { STARTING_EQUITY, AUTONOMOUS_WATCHLIST, ALPACA_PAPER_HOST } from '@shared/constants'
import type {
  Account, AiDecision, Candle, CredentialsMaskedStatus, CredentialsSetRequest,
  IndicatorSnapshot, LiveModeSetRequest, LiveModeStatus, NewsItem, Order,
  OrderRequest, Position, Quote, SystemStatus, TacticsStatus, AlpacaCredentialsStatus,
  AnthropicMaskedStatus
} from '@shared/types'
import { createLogger, configureLogger } from '../services/logger'
import * as db from '../services/persistence'
import { sessionId } from '../services/id-generator'
import {
  getAlpacaCreds, setAlpacaCreds, clearAlpacaCreds, getAlpacaCredsMasked,
  setAnthropicKey as storeSetAnthropicKey, getAnthropicMasked as storeGetAnthropicMasked
} from '../services/credential-store'
import { getLiveModeStatus, setLiveMode as storeSetLiveMode, isLive, getNotionalCap } from '../services/live-mode'
import { Brain } from '../services/brain'
import { TacticsEngine } from '../services/tactics'

const log = createLogger('engine')

export type QuotesBatchListener  = (quotes: Quote[]) => void
export type CandleListener       = (symbol: string, candle: Candle, isNew: boolean) => void
export type NewsListener         = (item: NewsItem) => void
export type AccountListener      = (account: Account) => void
export type OrdersListener       = (orders: Order[]) => void
export type StatusListener       = (status: SystemStatus) => void

export class TradingEngine {
  private market!: MarketDataSource
  private alpaca:  AlpacaClient | null = null
  public  om!:     OrderManager
  private brain:   Brain = new Brain()
  private tactics: TacticsEngine = new TacticsEngine()
  private currentSessionId = sessionId()
  private startedAt        = Date.now()
  private tickCount        = 0
  private lastTickAt       = 0
  private statusTimer:     NodeJS.Timeout | null = null
  private accountSyncTimer:NodeJS.Timeout | null = null
  private clockSyncTimer:  NodeJS.Timeout | null = null
  private pnlTimer:        NodeJS.Timeout | null = null
  private quoteBatch:      Quote[] = []
  private batchTimer:      NodeJS.Timeout | null = null
  /** Snapshot of features at order entry, keyed by order id — drives brain.learn on close. */
  private entryFeatures = new Map<string, { features: ReturnType<Brain['features']>; notional: number }>()

  // Push listeners — main/index.ts subscribes here
  private quoteListeners:  Set<QuotesBatchListener> = new Set()
  private candleListeners: Set<CandleListener>      = new Set()
  private newsListeners:   Set<NewsListener>        = new Set()
  private accountListeners:Set<AccountListener>     = new Set()
  private ordersListeners: Set<OrdersListener>      = new Set()
  private statusListeners: Set<StatusListener>      = new Set()

  async initialize(): Promise<void> {
    const env = getEnv()
    configureLogger(env.logLevel)
    log.info('engine initializing', { mode: env.useSimulator ? 'simulator' : 'alpaca' })

    // Session record
    db.insertSession({
      id: this.currentSessionId, startedAt: this.startedAt, endedAt: null,
      startingEquity: STARTING_EQUITY, endingEquity: null,
      peakEquity: STARTING_EQUITY, troughEquity: STARTING_EQUITY,
      realizedPnl: 0, tradeCount: 0,
    })

    // Restore watchlist or default
    const storedWatchlist = db.getWatchlist()
    if (storedWatchlist.length === 0) db.setWatchlist([...AUTONOMOUS_WATCHLIST])

    // Order manager
    this.om = new OrderManager(STARTING_EQUITY)
    this.om.onOrderFill((order, position) => {
      db.insertOrder(order, this.currentSessionId)
      this.broadcastOrders()
      this.broadcastAccount()
      this.onOrderFillForLearning(order, position)
    })
    this.om.onKillSwitch(() => {
      log.warn('kill switch triggered — broadcasting account state')
      this.broadcastAccount()
    })

    // Brain — load weights from db
    this.brain.initialize()

    // Tactics — seed from prior orders (approx)
    this.tactics.seedFromOrders(db.listAllOrders())

    // Credential resolution: stored credentials take precedence over env
    const stored = getAlpacaCreds()
    const keyId     = stored?.keyId     ?? env.alpacaKeyId
    const secretKey = stored?.secretKey ?? env.alpacaSecretKey
    const feed      = stored?.feed      ?? env.alpacaFeed
    const useAlpaca = !env.useSimulator && !!keyId && !!secretKey

    // Market data source
    if (!useAlpaca) {
      const seed = env.rngSeed ?? undefined
      this.market = new MarketSimulator(seed)
      log.info('using simulator', { seed, reason: keyId ? 'env-forced' : 'no-credentials' })
    } else {
      const cfg: AlpacaConfig = {
        keyId, secretKey,
        baseUrl: env.alpacaBaseUrl,
        dataUrl: env.alpacaDataUrl,
        feed,
      }
      this.alpaca = new AlpacaClient(cfg)
      this.market = new LiveMarket(this.alpaca)
      log.info('using alpaca live market', { feed, fromStore: !!stored })
    }

    // Wire data events
    this.market.onQuotes((quotes) => this.onQuotesBatch(quotes))
    this.market.onCandle((sym, c, isNew) => {
      for (const l of this.candleListeners) l(sym, c, isNew)
    })
    this.market.onNews((item) => {
      for (const l of this.newsListeners) l(item)
    })

    // Start data
    await (this.market as MarketDataSource & { start: () => void | Promise<void> }).start()

    // Periodic account sync from Alpaca
    if (this.alpaca) {
      this.accountSyncTimer = setInterval(() => void this.syncAlpacaAccount(), 15_000)
      void this.syncAlpacaAccount()
      this.clockSyncTimer = setInterval(() => void this.syncMarketClock(), 30_000)
      void this.syncMarketClock()
    } else {
      // Simulator → market is always "open" for paper testing
      this.om.setMarketOpen(true)
    }

    // System status heartbeat every 2s
    this.statusTimer = setInterval(() => this.broadcastStatus(), 2_000)

    // PnL snapshot every 60s
    this.pnlTimer = setInterval(() => this.recordPnlSnapshot(), 60_000)

    log.info('engine ready', { sessionId: this.currentSessionId })
  }

  shutdown(): void {
    if (this.statusTimer)      { clearInterval(this.statusTimer);       this.statusTimer = null }
    if (this.accountSyncTimer) { clearInterval(this.accountSyncTimer);  this.accountSyncTimer = null }
    if (this.clockSyncTimer)   { clearInterval(this.clockSyncTimer);    this.clockSyncTimer = null }
    if (this.pnlTimer)         { clearInterval(this.pnlTimer);          this.pnlTimer = null }
    if (this.batchTimer)       { clearTimeout(this.batchTimer);         this.batchTimer = null }
    this.market?.stop?.()
    this.alpaca?.disconnectMarketStream()
    this.alpaca?.disconnectAccountStream()
    db.updateSession(this.currentSessionId, { endedAt: Date.now(), endingEquity: this.om.getAccount().equity })
    db.closeDB()
    log.info('engine shutdown complete')
  }

  // ── Subscription API ────────────────────────────────────────────────────────
  onQuotes(fn: QuotesBatchListener):  () => void { this.quoteListeners.add(fn);   return () => this.quoteListeners.delete(fn) }
  onCandle(fn: CandleListener):       () => void { this.candleListeners.add(fn);  return () => this.candleListeners.delete(fn) }
  onNews(fn: NewsListener):           () => void { this.newsListeners.add(fn);    return () => this.newsListeners.delete(fn) }
  onAccount(fn: AccountListener):     () => void { this.accountListeners.add(fn); return () => this.accountListeners.delete(fn) }
  onOrders(fn: OrdersListener):       () => void { this.ordersListeners.add(fn);  return () => this.ordersListeners.delete(fn) }
  onStatus(fn: StatusListener):       () => void { this.statusListeners.add(fn);  return () => this.statusListeners.delete(fn) }

  // ── Order API ───────────────────────────────────────────────────────────────
  async submitOrder(req: OrderRequest, opts?: { signalConfidence?: number }): Promise<{ ok: boolean; orderId?: string; reason?: string }> {
    const quote = this.market.getQuote(req.symbol)
    const refPrice = quote?.last ?? req.limitPrice ?? 0
    const ctx: OrderValidationContext = {
      refPrice,
      liveMode: isLive(),
      notionalCap: getNotionalCap(),
      assetClass: quote?.assetClass ?? 'equity',
      signalConfidence: opts?.signalConfidence ?? 0.6,
      tacticsGate: req.side === 'buy' && !req.triggeredBy
        ? (sc) => this.tactics.preTradeGate(sc)
        : undefined,
    }

    const validation = this.om.validate(req, ctx)
    if (!validation.ok) {
      log.warn('order rejected by risk engine', { reason: validation.reason, gate: validation.gate })
      return { ok: false, reason: validation.reason }
    }

    const order = this.om.createOrder(req)

    // Capture entry features for brain learning on close
    if (req.side === 'buy' && quote) {
      try {
        const ind = computeSnapshot(req.symbol, this.market.getCandles(req.symbol, 200))
        const features = this.brain.features(quote, ind)
        this.entryFeatures.set(order.id, { features, notional: refPrice * req.quantity })
      } catch (e) { log.debug('feature capture failed', { err: String(e) }) }
    }

    if (this.alpaca) {
      try {
        const result = await this.alpaca.submitOrder(req)
        order.fillPrice = result.filledAvgPrice ?? undefined
        this.om.fillOrder(order.id, order.fillPrice ?? req.limitPrice ?? 0)
        log.info('alpaca paper order submitted', { alpacaId: result.id, status: result.status })
      } catch (err) {
        this.om.rejectOrder(order.id, String(err))
        return { ok: false, reason: String(err) }
      }
    } else {
      const fillPrice = quote?.last ?? req.limitPrice ?? 0
      setTimeout(() => this.om.fillOrder(order.id, fillPrice), 50)
    }

    return { ok: true, orderId: order.id }
  }

  async cancelOrder(id: string): Promise<void> {
    if (this.alpaca) { try { await this.alpaca.cancelOrder(id) } catch (e) { log.warn('cancel failed', { id, err: String(e) }) } }
    this.om.cancelOrder(id)
  }

  armKillSwitch(): void  { this.om.armKillSwitch('user') }
  disarmKillSwitch(): void { this.om.disarmKillSwitch() }

  // ── Data API ─────────────────────────────────────────────────────────────────
  getCandles(symbol: string, limit?: number): Candle[] {
    return this.market.getCandles(symbol, limit)
  }

  getAllQuotes(): Quote[] { return this.market.getAllQuotes() }

  getIndicators(symbol: string): IndicatorSnapshot {
    const candles = this.market.getCandles(symbol, 200)
    return computeSnapshot(symbol, candles)
  }

  getWatchlist(): string[] { return db.getWatchlist() }
  setWatchlist(symbols: string[]): void { db.setWatchlist(symbols) }

  getOrdersHistory(sessionId?: string): Order[] {
    return sessionId ? db.listOrders(sessionId) : db.listAllOrders()
  }

  getSessions() { return db.listSessions() }
  getPnlSnapshots(sessId: string) { return db.listPnlSnapshots(sessId) }
  getBrainParams() { return db.listBrainParams() }

  getCredentialsStatus(): AlpacaCredentialsStatus {
    const env = getEnv()
    const stored = getAlpacaCreds()
    const keyId = stored?.keyId ?? env.alpacaKeyId
    const secretKey = stored?.secretKey ?? env.alpacaSecretKey
    return {
      paperConfigured:      !!keyId && !!secretKey,
      liveConfigured:       false,
      baseUrl:              env.alpacaBaseUrl,
      dataUrl:              env.alpacaDataUrl,
      feed:                 stored?.feed ?? env.alpacaFeed,
      paperEndpointConfirmed: env.alpacaBaseUrl.includes(ALPACA_PAPER_HOST),
    }
  }

  // ── Credentials (encrypted store) ───────────────────────────────────────────
  getCredentialsMasked(): CredentialsMaskedStatus { return getAlpacaCredsMasked() }
  setCredentials(req: CredentialsSetRequest): { ok: boolean; reason?: string } { return setAlpacaCreds(req) }
  clearCredentials(): { ok: boolean } { clearAlpacaCreds(); return { ok: true } }
  setAnthropicKey(key: string): { ok: boolean; reason?: string } { return storeSetAnthropicKey(key) }
  getAnthropicMasked(): AnthropicMaskedStatus { return storeGetAnthropicMasked() }

  /** Rebuild AlpacaClient + LiveMarket using freshly stored credentials. */
  async reconnectAlpaca(): Promise<{ ok: boolean; reason?: string }> {
    const stored = getAlpacaCreds()
    if (!stored) return { ok: false, reason: 'No stored credentials' }
    const env = getEnv()
    try {
      this.alpaca?.disconnectMarketStream()
      this.alpaca?.disconnectAccountStream()
      this.market?.stop?.()
      const cfg: AlpacaConfig = {
        keyId: stored.keyId, secretKey: stored.secretKey,
        baseUrl: env.alpacaBaseUrl, dataUrl: env.alpacaDataUrl,
        feed: stored.feed,
      }
      this.alpaca = new AlpacaClient(cfg)
      this.market = new LiveMarket(this.alpaca)
      this.market.onQuotes((quotes) => this.onQuotesBatch(quotes))
      this.market.onCandle((sym, c, isNew) => { for (const l of this.candleListeners) l(sym, c, isNew) })
      this.market.onNews((item) => { for (const l of this.newsListeners) l(item) })
      await (this.market as MarketDataSource & { start: () => void | Promise<void> }).start()
      void this.syncAlpacaAccount()
      void this.syncMarketClock()
      log.info('alpaca reconnected', { feed: stored.feed })
      return { ok: true }
    } catch (err) {
      log.error('reconnect failed', { err: String(err) })
      return { ok: false, reason: String(err) }
    }
  }

  // ── Live mode ───────────────────────────────────────────────────────────────
  getLiveMode(): LiveModeStatus {
    return getLiveModeStatus(getEnv().alpacaBaseUrl)
  }
  setLiveMode(req: LiveModeSetRequest): { ok: boolean; reason?: string } {
    const acct = this.om.getAccount()
    return storeSetLiveMode(req, {
      killArmed: acct.killSwitchArmed,
      equity: acct.equity,
      dailyPnl: acct.dailyPnl,
      dailyLossLimitPct: acct.dailyLossLimitPct,
    })
  }

  // ── AI brain ────────────────────────────────────────────────────────────────
  async getAiDecision(symbol: string): Promise<AiDecision> {
    const quote = this.market.getQuote(symbol)
    if (!quote) throw new Error(`no quote for ${symbol}`)
    const ind = computeSnapshot(symbol, this.market.getCandles(symbol, 200))
    return this.brain.decide(symbol, quote, ind)
  }

  // ── MAY-TACTICS ─────────────────────────────────────────────────────────────
  getTacticsStatus(): TacticsStatus { return this.tactics.status() }
  graduateTactics(): { ok: boolean; reason?: string } { return this.tactics.graduate() }

  healthCheck(): { ok: boolean; uptime: number; mode: string } {
    return {
      ok:     true,
      uptime: Date.now() - this.startedAt,
      mode:   this.alpaca ? 'alpaca-paper' : 'simulator',
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────────
  private onQuotesBatch(quotes: Quote[]): void {
    this.tickCount++
    this.lastTickAt = Date.now()
    // Update unrealized P&L for all positions
    for (const q of quotes) this.om.updatePositionPrice(q.symbol, q.last)
    // Batch + debounce pushes to renderer
    for (const q of quotes) {
      const idx = this.quoteBatch.findIndex((x) => x.symbol === q.symbol)
      if (idx >= 0) this.quoteBatch[idx] = q
      else this.quoteBatch.push(q)
    }
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.batchTimer = null
        const batch = this.quoteBatch.splice(0)
        for (const l of this.quoteListeners) l(batch)
      }, 50)
    }
  }

  private broadcastAccount(): void {
    const account = this.om.getAccount()
    for (const l of this.accountListeners) l(account)
    // Persist watermarks
    const eq = account.equity
    const sess = db.listSessions(1)[0]
    if (sess) {
      db.updateSession(this.currentSessionId, {
        peakEquity:   Math.max(sess.peakEquity,   eq),
        troughEquity: Math.min(sess.troughEquity, eq),
      })
    }
  }

  private broadcastOrders(): void {
    const orders = this.om.getOrders()
    for (const l of this.ordersListeners) l(orders)
  }

  private broadcastStatus(): void {
    const mem = process.memoryUsage()
    const status: SystemStatus = {
      connected:   this.alpaca ? this.alpaca.isMarketConnected : true,
      mode:        this.alpaca ? 'paper' : 'simulator',
      tickHz:      this.tickCount > 0 ? Math.round(1000 / Math.max(1, this.lastTickAt - Date.now() + 2000)) : 0,
      latencyMs:   this.alpaca ? this.alpaca.msSinceLastTick : 0,
      cpuPct:      0,
      memMb:       Math.round(mem.heapUsed / 1024 / 1024),
      uptime:      Math.floor((Date.now() - this.startedAt) / 1000),
      lastError:   null,
      lastTickIso: this.lastTickAt ? new Date(this.lastTickAt).toISOString() : null,
    }
    for (const l of this.statusListeners) l(status)
  }

  private async syncMarketClock(): Promise<void> {
    if (!this.alpaca) return
    try {
      const clock = await this.alpaca.getClock()
      this.om.setMarketOpen(clock.isOpen)
    } catch (err) {
      log.warn('clock sync failed', { err: String(err) })
    }
  }

  /**
   * Brain + tactics learning hook — runs after every fill.
   * On position flatten (sell that closes the position), record outcome to
   * tactics and feed SGD update into brain using the captured entry features.
   */
  private onOrderFillForLearning(order: Order, position: Position | null): void {
    if (order.status !== 'filled') return
    const { side, symbol, quantity } = order.request
    // Position-flat detection: sell that resulted in no position
    if (side === 'sell' && !position) {
      // The position has been deleted from the order manager; pnl was applied
      // to account.dailyPnl by applyFill. We approximate realized pnl for this
      // closing trade from the last seen avgPrice — captured at entry.
      const entry = this.entryFeatures.get(order.id) ?? null
      const fillPrice = order.fillPrice ?? 0
      // Coarse realized-pnl approximation: close notional minus stored entry notional.
      // Caller could pair sells to opens via clientOrderId later for accuracy.
      const realizedPnl = entry ? fillPrice * quantity - entry.notional : 0
      this.tactics.recordOutcome(symbol, realizedPnl)
      if (entry) this.brain.learn(realizedPnl, entry.notional, entry.features, 'buy')
      this.entryFeatures.delete(order.id)
      db.updateSession(this.currentSessionId, { tradeCount: db.listOrders(this.currentSessionId).length })
      log.info('learning hook fired', { symbol, realizedPnl })
    }
  }

  private async syncAlpacaAccount(): Promise<void> {
    if (!this.alpaca) return
    try {
      const [snap, positions] = await Promise.all([
        this.alpaca.getAccount(),
        this.alpaca.getPositions(),
      ])
      const satexPositions = positions.map((p) =>
        AlpacaClient.toSatexPosition(p, Date.now())
      )
      this.om.syncFromAlpaca(snap, satexPositions)
      this.broadcastAccount()
    } catch (err) {
      log.warn('alpaca account sync failed', { err: String(err) })
    }
  }

  private recordPnlSnapshot(): void {
    const account = this.om.getAccount()
    let unrealized = 0
    for (const p of account.openPositions) unrealized += p.unrealizedPnl
    db.insertPnlSnapshot({
      sessionId: this.currentSessionId,
      timestamp: Date.now(),
      equity: account.equity,
      cash: account.cash,
      realizedPnl: account.dailyPnl - unrealized,
      unrealizedPnl: unrealized,
    })
  }
}
