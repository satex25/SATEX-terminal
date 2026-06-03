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
import { app, powerMonitor } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { getEnv } from '../services/env'
import { evaluateDataSourceSwitch } from './data-source-guard'
import { AlpacaClient } from '../services/alpaca'
import type { AlpacaConfig, AlpacaTick } from '../services/alpaca'
import { AlpacaBrokerSession } from '../services/alpaca/broker-session'
import type { OrderEvent } from '@shared/broker/order-router'
import { MarketSimulator, type MarketDataSource, type Unsub } from '../services/market-data'
import { LiveMarket } from '../services/live-market'
import { OrderManager, type OrderValidationContext } from '../services/order-manager'
import { TickRecorder } from '../services/tick-recorder'
import { ReplaySource } from '../services/replay-source'
import { HistoricalImporter } from '../services/historical-importer'
import { SubSecondCandleAggregator, type SubSecondCandle, type PreferredBucket } from '../services/subsecond-aggregator'
import { SubsecondRetentionWorker } from '../services/subsecond-retention'
import { SubsecondTelemetry } from '../services/subsecond-telemetry'
import { computeSnapshot } from '@shared/indicators'
import { DEFAULT_EQUITY, AUTONOMOUS_WATCHLIST, ALPACA_PAPER_HOST, UNIVERSE, findUniverseEntry } from '@shared/constants'
import type {
  Account, AiDecision, AlpacaModeSetRequest, AlpacaModeStatus,
  Candle,
  CredentialsMaskedStatus, CredentialsSetRequest,
  IndicatorSnapshot, LiveModeSetRequest, LiveModeStatus, NewsItem, NewsKind, Order,
  OrderRequest, Position, Quote, SystemStatus, TacticsStatus, AlpacaCredentialsStatus,
  BaiduMaskedStatus, ObserverStats, LearnerStats, VaultStats, PatternWeight,
  VaultCheckpointRequest,
  ReplayStatus, ReplayStartRequest, ReplayBookmark, ReplayableSession,
  HistoricalImportRequest, HistoricalImportResult, HistoricalBarsRequest, HistoricalBarsResult,
  ClosedTrade, JournalTag, Trade,
} from '@shared/types'
import { shortId } from '../services/id-generator'
import { createLogger, configureLogger } from '../services/logger'
import * as db from '../services/persistence'
import { sessionId } from '../services/id-generator'
import {
  getAlpacaCreds, setAlpacaCreds, clearAlpacaCreds, getAlpacaCredsMasked,
  setBaiduKey as storeSetBaiduKey, getBaiduMasked as storeGetBaiduMasked
} from '../services/credential-store'
import { getLiveModeStatus, setLiveMode as storeSetLiveMode, isLive, getNotionalCap } from '../services/live-mode'
import { getAlpacaMode, setAlpacaMode as storeSetAlpacaMode, resolveBaseUrl } from '../services/alpaca-mode'
import { loadKillSwitchState, saveKillSwitchState } from '../services/kill-switch-store'
import { Brain } from '../services/brain'
import { TacticsEngine } from '../services/tactics'
import { MarketObserver } from '../services/market-observer'
import { PatternLearner } from '../services/pattern-learner'
import { VaultWriter } from '../services/vault-writer'
import { AutonomousTrader, type AutonomousConfig } from '../services/autonomous-trader'
import type { AutonomousDecision, AutonomousStatus, DataSource, DataSourceStatus } from '@shared/types'
import { RegimeService } from '../services/regime'
import { RiskGatesService } from '../services/risk-gates'
import { MacroCalendarService } from '../services/macro-calendar'
import { SystemLogsService } from '../services/system-logs'
import { DepthFeedService } from '../services/depth-feed'
import { EdgarService } from '../services/edgar'
import type {
  RegimeSnapshot, RiskGatesSnapshot, MacroSnapshot, SystemLogsTail, DepthSnapshot,
  FeedStatus,
} from '@shared/types'

const log = createLogger('engine')

export type QuotesBatchListener  = (quotes: Quote[]) => void
export type CandleListener       = (symbol: string, candle: Candle, isNew: boolean) => void
export type NewsListener         = (item: NewsItem) => void
export type AccountListener      = (account: Account) => void
export type OrdersListener       = (orders: Order[]) => void
export type StatusListener       = (status: SystemStatus) => void
export type ObserverStatsListener = (s: ObserverStats) => void
export type LearnerStatsListener  = (s: LearnerStats) => void
export type VaultStatsListener    = (s: VaultStats) => void
export type ReplayStatusListener  = (s: ReplayStatus) => void
export type AutonomousStatusListener   = (s: AutonomousStatus) => void
export type AutonomousDecisionListener = (d: AutonomousDecision) => void
export type RegimeListener     = (s: RegimeSnapshot) => void
export type RiskGatesListener  = (s: RiskGatesSnapshot) => void
export type MacroListener      = (s: MacroSnapshot) => void
export type LogsTailListener   = (s: SystemLogsTail) => void
export type DepthListener      = (s: DepthSnapshot) => void
export type TradeClosedListener = (t: ClosedTrade) => void
export type TradesListener = (trades: Trade[]) => void
export type FeedStatusListener = (s: FeedStatus) => void
/** A1 (v0.4.4) — fires on every sub-second crypto bar seal. main/index.ts
 *  forwards via IPC.SUBSECOND_CANDLES_UPDATE to the renderer. */
export type SubSecondCandleListener = (c: SubSecondCandle) => void
/** A1 Sprint 2 — fires AFTER a successful setSubsecondPref. main/index.ts
 *  wires this to SubsecondPrefsService.setOne for disk write-through. */
export type SubSecondPrefChangedListener = (symbol: string, ms: PreferredBucket) => void

/** Captured at order entry; drives Brain.learn and vault narrative on close.
 *  The `symbol` field is load-bearing — it lets us pair server-side bracket
 *  child fills (which arrive with a different orderId than the parent we
 *  created) back to the entry that opened the position. */
interface EntryFeaturesValue {
  symbol: string
  features: ReturnType<Brain['features']>
  notional: number
  regime: string | null
  tactics: TacticsStatus | null
  aiDecision: AiDecision | null
  avgPrice: number
  openedAt: number
  /** Phase 12 / P0-2 — journal metadata carried from the entry OrderRequest
   *  so the close-side ClosedTrade event can include tags + conviction. */
  tags?: string[]
  conviction?: number
  /** S1-6 — reference quote captured at submit time. Used to compute entry
   *  slippage once the fill price comes back from Alpaca. */
  quoteAtSubmit?: number
  /** S1-6 — computed at entry fill, stamped here so the close-side
   *  recordTradeClose can copy it onto the ClosedTrade event. Null when no
   *  reference quote was available. */
  entrySlippageBps?: number | null
}

export class TradingEngine {
  private market!: MarketDataSource
  private alpaca:  AlpacaClient | null = null
  /** BrokerSession umbrella — owns the equity + account WS lifecycle for live
   *  Alpaca mode. Null in simulator/replay. F.1 migration (2026-06-02): the
   *  engine now drives connect/disconnect via this rather than calling
   *  market.start() + per-stream disconnect methods directly. Crypto WS is
   *  still engine-owned (not part of LiveMarket / BrokerSession today). */
  private session: AlpacaBrokerSession | null = null
  /** Dedicated AlpacaClient that ONLY handles the crypto WebSocket
   *  (wss://stream.data.alpaca.markets/v1beta3/crypto/us). Runs in parallel
   *  with the equity market source (simulator OR live IEX), so BTC/ETH stream
   *  24/7 regardless of US-market hours. Null when no Alpaca credentials
   *  are saved or when the crypto stream couldn't authenticate. */
  private cryptoAlpaca: AlpacaClient | null = null
  public  om!:     OrderManager
  private brain:   Brain = new Brain()
  private tactics: TacticsEngine = new TacticsEngine()
  private observer!: MarketObserver
  private learner!:  PatternLearner
  private vault!:    VaultWriter
  private autonomous!: AutonomousTrader
  // ── Phase 10: SATEX Terminal v2 · Black Box services ──────────────────────
  private regime!:      RegimeService
  private riskGates!:   RiskGatesService
  private macro!:       MacroCalendarService
  public  logs!:        SystemLogsService  // public so configureLogger can hand it the ingest fn
  private depth!:       DepthFeedService
  private edgar!:       EdgarService
  /** Per-session live tape recorder. Null only before initialize(). */
  private recorder: TickRecorder | null = null
  /** Stashed live source while a replay is active; restored on replay stop. */
  private liveMarket: MarketDataSource | null = null
  /** Active replay source — present iff replay-mode === 'playing' | 'paused'. */
  private replay: ReplaySource | null = null
  /** Cached unsubscribes for the current market source's wiring. Re-installed
   *  whenever we swap source (live ↔ replay) so listeners follow the swap. */
  private marketSubs: Unsub[] = []
  /** The active market DATA feed. Set in initialize(); flipped by setDataSource. */
  private dataSource: DataSource = 'simulator'
  /** True only during a setDataSource swap — gates submitOrder. */
  private switchingSource = false
  private replayStatusTimer: NodeJS.Timeout | null = null
  private currentSessionId = sessionId()
  private startedAt        = Date.now()
  private tickCount        = 0
  private lastTickAt       = 0
  /** Rolling 1-second tick timestamps. broadcastStatus reads .length as the
   *  true tickHz. Pre-2026-05-18 status panel computed tickHz from
   *  `lastTickAt - Date.now() + 2000`, which is always ≤ 2000 and inverted
   *  the metric (high tick rate showed as low number). */
  private tickWindow: number[] = []
  private static TICK_WINDOW_MS = 1000
  /** Adversarial finding C2 (2026-05-16) — gates the one-shot
   *  sessionStartEquity sync that runs on the first successful Alpaca
   *  account sync of the session. See `syncAlpacaAccount`. */
  private alpacaFirstSyncDone = false
  private statusTimer:     NodeJS.Timeout | null = null
  private accountSyncTimer:NodeJS.Timeout | null = null
  private clockSyncTimer:  NodeJS.Timeout | null = null
  private pnlTimer:        NodeJS.Timeout | null = null
  private continuousStatsTimer: NodeJS.Timeout | null = null
  private vaultCheckpointTimer: NodeJS.Timeout | null = null
  private healthLogTimer:       NodeJS.Timeout | null = null
  private entryCleanupTimer:    NodeJS.Timeout | null = null
  private tapePruneTimer:       NodeJS.Timeout | null = null
  /** True once boot-time seed has been pushed to the renderer. Prevents
   *  duplicate floods on renderer remounts (HMR / devtools reload). */
  private seedBroadcastDone = false
  /** Days of tick-tape to retain. Beyond this, rows get pruned on startup
   *  and every 24h. Tunable via env later if needed. */
  private static TAPE_RETENTION_DAYS = 7
  private quoteBatch:      Quote[] = []
  private batchTimer:      NodeJS.Timeout | null = null
  /** 2026-05-18 — trade batch + timer mirror the quote-batch coalescing.
   *  Pre-fix LiveMarket.onTick fired tradeListeners with a 1-element batch
   *  per tick (~360 IPC events/sec at peak), wedging the renderer's
   *  footprint store under load. Matches the 50ms window used elsewhere. */
  private tradeBatch: Trade[] = []
  private tradeBatchTimer: NodeJS.Timeout | null = null
  private static TRADE_BATCH_MS = 50
  /** Snapshot of features at order entry, keyed by order id — drives brain.learn on close. */
  private entryFeatures = new Map<string, EntryFeaturesValue>()
  /** Tracks brokerOrderId → SATEX orderId for parent orders submitted by the
   *  engine. Populated post-submit; cleared on FILL/REJECT/CANCEL/EXPIRE so
   *  long-running sessions don't accumulate stale mappings. Bracket-child
   *  fills have broker order IDs not present here. */
  private brokerOrderIdToSatexId = new Map<string, string>()
  /** Last seen tactics state — used to detect transitions so we can vault them. */
  private lastTacticsState: TacticsStatus['state'] | null = null

  // Push listeners — main/index.ts subscribes here
  private quoteListeners:  Set<QuotesBatchListener> = new Set()
  private candleListeners: Set<CandleListener>      = new Set()
  /** Bulk-snapshot path — fires once per symbol when ReplaySource.warmup
   *  finishes. main/index.ts forwards to renderer via CANDLES_BULK_REPLACE. */
  private bulkCandlesListeners: Set<(symbol: string, candles: Candle[]) => void> = new Set()
  private newsListeners:   Set<NewsListener>        = new Set()
  private accountListeners:Set<AccountListener>     = new Set()
  private ordersListeners: Set<OrdersListener>      = new Set()
  private statusListeners: Set<StatusListener>      = new Set()
  private observerStatsListeners: Set<ObserverStatsListener> = new Set()
  private learnerStatsListeners:  Set<LearnerStatsListener>  = new Set()
  private vaultStatsListeners:    Set<VaultStatsListener>    = new Set()
  private replayStatusListeners:  Set<ReplayStatusListener>  = new Set()
  private autonomousStatusListeners:   Set<AutonomousStatusListener>   = new Set()
  private autonomousDecisionListeners: Set<AutonomousDecisionListener> = new Set()
  private regimeListeners:     Set<RegimeListener>    = new Set()
  private riskGatesListeners:  Set<RiskGatesListener> = new Set()
  private macroListeners:      Set<MacroListener>     = new Set()
  private logsListeners:       Set<LogsTailListener>  = new Set()
  private depthListeners:      Set<DepthListener>     = new Set()
  private tradeClosedListeners: Set<TradeClosedListener> = new Set()
  private tradesListeners:      Set<TradesListener>      = new Set()
  /** B3 (2026-05-18) — per-asset-class feed status. Diff-gated in
   *  broadcastStatus so we only push when a class transitions. */
  private feedStatusListeners:  Set<FeedStatusListener>  = new Set()
  private lastFeedStatus: FeedStatus | null = null
  /** A1 (v0.4.4) — sub-second crypto candle aggregator. Lazily constructed in
   *  initialize() after `db` is open. The crypto WS tick path feeds it via
   *  `onCryptoTick`; renderer subscribes via the listener set below. */
  private subsecond: SubSecondCandleAggregator | null = null
  private subsecondListeners: Set<SubSecondCandleListener> = new Set()
  /** A1 Sprint 2 — write-through listeners for per-symbol bucket prefs. main
   *  wires SubsecondPrefsService.setOne here so a renderer setSubsecondPref
   *  IPC call persists to disk. */
  private subsecondPrefListeners: Set<SubSecondPrefChangedListener> = new Set()
  /** A1 Sprint 3 — periodic retention worker (60s cadence). Replaces the
   *  per-insert trim that ran inside aggregator.sealBucket() in Sprint 1. */
  private subsecondRetention: SubsecondRetentionWorker | null = null
  /** A1 Sprint 3 — per-minute INFO log of (symbol, bucketMs) emit rates so
   *  operators can spot pathological symbols in production logs. */
  private subsecondTelemetry: SubsecondTelemetry | null = null
  /** Most-recent closed-trade history kept in memory for the JournalPanel.
   *  Pushed to renderer on each close; capped so a long session doesn't
   *  grow unbounded. Persists across replay swap (it's session-scoped). */
  private closedTrades: ClosedTrade[] = []
  private static CLOSED_TRADES_CAP = 500

  /** v0.4.3 B11 — powerMonitor 'suspend' handler. Pauses the recorder so its
   *  flush timer isn't queued for the entire suspend duration. Arrow field so
   *  `powerMonitor.off(...)` in shutdown() can pass the same reference.
   *
   *  v0.4.4 A1 — also seals every in-flight sub-second bucket so the close
   *  before the suspend is persisted, not lost. On resume, fresh ticks open
   *  fresh buckets (no half-bucket carryover across the suspend gap). */
  private onSystemSuspend = (): void => {
    log.warn('system suspend — pausing tick recorder + sealing sub-second buckets')
    this.recorder?.pause()
    try { this.subsecond?.forceSealAll() }
    catch (e) { log.warn('subsecond forceSealAll on suspend failed', { err: String(e) }) }
  }

  /** v0.4.3 B11 — powerMonitor 'resume' handler. Wakes the recorder and
   *  force-flushes anything that was in the buffer when suspend hit. */
  private onSystemResume = (): void => {
    log.warn('system resume — resuming tick recorder + force-flushing')
    this.recorder?.resume()
    try { this.recorder?.forceFlush() }
    catch (e) { log.warn('post-resume forceFlush failed', { err: String(e) }) }
  }

  /** Run an async op fire-and-forget WITHOUT losing failures to the void.
   *  Replaces ad-hoc `void this.X()` patterns. Failures inside `op` (vault
   *  writes, Alpaca syncs, etc.) become log.error entries instead of silent
   *  unhandled rejections that vanish after S0-1's gracefulShutdown handler
   *  catches them. Use when the caller genuinely doesn't need the result
   *  but does need to know if the op exploded. */
  private fireAndForget(label: string, op: () => Promise<unknown>): void {
    op().catch((e) => log.error(`${label} failed`, { err: String(e), stack: (e as Error)?.stack }))
  }

  async initialize(): Promise<void> {
    const env = getEnv()
    // System logs service must exist before configureLogger so the ingest hook
    // captures boot-time entries (otherwise the first ~20 INFO lines vanish).
    this.logs = new SystemLogsService()
    configureLogger(env.logLevel, this.logs.ingest)
    log.info('engine initializing', { mode: env.useSimulator ? 'simulator' : 'alpaca' })

    // ── DB maintenance (2026-05-16 follow-up to Phase 4.2) ─────────────────
    // Pre-fix: a synchronous `db.compactIfLarge(1 GB)` call here blocked the
    // engine for 20-30s on multi-GB DBs (observed 22s on a 2.9 GB DB), which
    // cascaded into the renderer dom-ready watchdog firing and forcing a
    // reload. Boot critical path is now under 1s in all cases.
    //
    // Maintenance is deferred 30s post-init so the engine + renderer are
    // both fully wired before any DELETE / incremental_vacuum work runs.
    // The prune itself is chunked + yielded so per-chunk blocking stays
    // under ~50 ms — IPC, frame timers, and the tick recorder all keep
    // running during the maintenance window.
    //
    // Retention: 48 hours. Covers the most recent two trading days so
    // yesterday's tape is still replay-ready, while still pruning anything
    // older. Tighter than the original 7-day window because tick density
    // (~360 rows/sec × 18 symbols ≈ 23 K rows/min) makes weekly retention
    // accumulate to multi-GB faster than the engine compacts. Change here
    // is the single source of truth — the persistence layer keeps its own
    // 7-day default as a defensive fallback for callers that don't pass
    // pruneOlderThanMs explicitly.
    //
    // Heavy file-shrinking VACUUM is intentionally NOT triggered here —
    // that requires an explicit user-initiated operation (see Settings →
    // Compact database).
    db.scheduleBackgroundMaintenance({
      delayMs: 30_000,
      pruneOlderThanMs: 48 * 60 * 60 * 1000,
    })

    // Session record
    db.insertSession({
      id: this.currentSessionId, startedAt: this.startedAt, endedAt: null,
      startingEquity: DEFAULT_EQUITY, endingEquity: null,
      peakEquity: DEFAULT_EQUITY, troughEquity: DEFAULT_EQUITY,
      realizedPnl: 0, tradeCount: 0,
    })

    // Restore watchlist or default
    const storedWatchlist = db.getWatchlist()
    if (storedWatchlist.length === 0) db.setWatchlist([...AUTONOMOUS_WATCHLIST])

    // Order manager
    this.om = new OrderManager(DEFAULT_EQUITY)
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

    // Kill-switch persistence (2026-05-18 — closes deferred item #1 from
    // v0.4 stabilization). Manual arms, daily-loss auto-arms, and disarms all
    // route through saveKillSwitchState so userData/kill-switch.json reflects
    // current armed state at all times. On boot, restore state IFF disk says
    // armed — disarmed is the default and needs no restore call.
    this.om.setOnKillSwitchChange(saveKillSwitchState)
    const restoredKill = loadKillSwitchState()
    if (restoredKill.armed) this.om.restoreKillSwitch(restoredKill.reason)

    // A1 (v0.4.4) — sub-second crypto candle aggregator. Constructed eagerly
    // even when no Alpaca credentials are present; without crypto WS ticks the
    // aggregator simply sits idle. onEmit fans the seal-event out to whoever
    // subscribed via onSubsecondCandle — main/index.ts wires that to the
    // SUBSECOND_CANDLES_UPDATE push channel. Persistence is the module-scope
    // db helpers added alongside this commit. forceSealAll runs at shutdown
    // and on powerMonitor 'suspend' so the most-recent partial bucket is
    // captured before state is dropped.
    // A1 Sprint 3 — telemetry built BEFORE the aggregator so the aggregator
    // can take its recordEmit method as the onTelemetryEmit dep. The retention
    // worker is independent of the aggregator — it reads the table directly
    // via db.getAllSubSecondSeries — and is constructed alongside.
    this.subsecondTelemetry = new SubsecondTelemetry({})
    this.subsecondRetention = new SubsecondRetentionWorker({
      persistence: {
        getAllSeries: () => db.getAllSubSecondSeries(),
        trim:         (s, b, k) => db.trimSubSecondCandles(s, b, k),
      },
    })
    this.subsecond = new SubSecondCandleAggregator({
      persistence: { insert: (c) => db.insertSubSecondCandle(c) },
      onEmit: (c) => { for (const l of this.subsecondListeners) l(c) },
      // A1 Sprint 2 — write-through fan-out. main/index.ts subscribes via
      // engine.onSubsecondPrefChanged() and calls SubsecondPrefsService.setOne
      // so the renderer's setSubsecondPref invoke persists to disk before the
      // promise resolves (handler awaits both engine update + disk write).
      onPreferenceChanged: (sym, ms) => {
        for (const l of this.subsecondPrefListeners) {
          try { l(sym, ms) }
          catch (e) { log.warn('subsecond pref listener threw', { err: String(e) }) }
        }
      },
      // A1 Sprint 3 — bind the telemetry counter to every seal. Bound method
      // reference is stable (telemetry is constructed once); aggregator
      // swallows any throw so a telemetry hiccup can never crash the tick path.
      onTelemetryEmit: (sym, bms) => this.subsecondTelemetry?.recordEmit(sym, bms),
    })
    // Start both Sprint 3 workers now that all wiring is complete. start() is
    // idempotent on both; shutdown() pairs each with stop().
    this.subsecondRetention.start()
    this.subsecondTelemetry.start()

    // Brain — load weights from db
    this.brain.initialize()

    // Tactics — seed from prior orders (approx)
    this.tactics.seedFromOrders(db.listAllOrders())

    // Credential resolution: stored credentials take precedence over env.
    // Mode selection is owned by alpaca-mode.ts; default is 'paper'. Env vars
    // (if set) feed into the paper slot only — they predate dual-mode and
    // there's no separate ALPACA_LIVE_KEY_ID convention.
    const mode = getAlpacaMode()
    const stored = getAlpacaCreds(mode)
    const keyId     = stored?.keyId     ?? (mode === 'paper' ? env.alpacaKeyId     : '')
    const secretKey = stored?.secretKey ?? (mode === 'paper' ? env.alpacaSecretKey : '')
    const feed      = stored?.feed      ?? env.alpacaFeed
    const baseUrl   = resolveBaseUrl(env.alpacaBaseUrl)
    const useAlpaca = !env.useSimulator && !!keyId && !!secretKey

    // Market data source
    if (!useAlpaca) {
      const seed = env.rngSeed ?? undefined
      // Task 3 (2026-05-26): when creds ARE saved but env forces simulator mode,
      // pull real Alpaca snapshots to seed the GBM walk. Without this the sim
      // boots from the hardcoded UNIVERSE.seed values, which drift away from
      // reality between releases (e.g. NVDA $965 is a pre-2024-split number).
      // Best-effort with a 3s budget so a slow/unreachable Alpaca never stalls
      // engine boot — falls back to UNIVERSE.seed silently on failure.
      const seedOverrides = await this.hydrateSimulatorSeedsBestEffort()
      this.market = new MarketSimulator(seed, seedOverrides)
      const reason = env.useSimulator ? 'env-forced' : 'no-credentials'
      log.info('using simulator', {
        seed, reason, mode, hasStoredCreds: !!stored,
        ...(seedOverrides && seedOverrides.size > 0 ? { hydratedSeeds: seedOverrides.size } : {}),
      })
    } else {
      const cfg: AlpacaConfig = {
        keyId, secretKey,
        baseUrl,
        dataUrl: env.alpacaDataUrl,
        feed,
      }
      this.alpaca = new AlpacaClient(cfg)
      this.market = new LiveMarket(this.alpaca)
      this.session = AlpacaBrokerSession.create(this.alpaca, this.market)
      // F.1 L1.A 2.1: wire bracket-fill learning via OrderRouter.onUpdate.
      // AlpacaOrderRouter translates wire trade_updates to OrderEvent and fans
      // them out; bracket children (stop/TP fills never round-tripped through
      // our OrderManager) arrive with clientOrderId='' and are handled in
      // onOrderEvent with the symbol+side fields preserved on the FILL event.
      this.session.orders.onUpdate((e) => this.onOrderEvent(e))
      log.info('using alpaca live market', { feed, mode, fromStore: !!stored, baseUrl })
    }
    this.dataSource = useAlpaca ? 'live' : 'simulator'

    // Wire data events (helper so we can re-wire on live↔replay swap)
    this.installMarketWiring(this.market)

    // Start data. Live mode goes through the BrokerSession (drives data.start
    // + connectAccountStream + state observer); simulator has no session so
    // we start the source directly.
    if (this.session) {
      await this.session.connect()
    } else {
      await (this.market as MarketDataSource & { start: () => void | Promise<void> }).start()
    }

    // ── Tick recorder (Phase 9): captures live tape for later replay ────────
    this.recorder = new TickRecorder(this.currentSessionId)
    this.marketSubs.push(this.market.onQuotes(q => this.recorder?.ingest(q)))
    this.recorder.start()

    // ── v0.4.3 B11: powerMonitor lifecycle for laptop suspend/resume ────────
    // Without these, a laptop suspend during recording leaves the flush timer
    // queued for the entire suspend duration. On wake, the timer fires
    // immediately with a buffer that may have grown unbounded if quotes were
    // still arriving (they aren't, because the WS is also suspended — but the
    // ingest path runs in the same thread and depends on cooperative Node
    // scheduling that's brittle across suspend). Cleaner: pause on suspend,
    // resume + force-flush on wake. powerMonitor is only valid after
    // app.whenReady(), which has already fired by the time engine.initialize
    // runs.
    powerMonitor.on('suspend', this.onSystemSuspend)
    powerMonitor.on('resume',  this.onSystemResume)

    // Periodic account sync from Alpaca
    if (this.alpaca) {
      this.accountSyncTimer = setInterval(() => this.fireAndForget('syncAlpacaAccount', () => this.syncAlpacaAccount()), 15_000)
      this.fireAndForget('syncAlpacaAccount', () => this.syncAlpacaAccount())
      this.clockSyncTimer = setInterval(() => this.fireAndForget('syncMarketClock', () => this.syncMarketClock()), 30_000)
      this.fireAndForget('syncMarketClock', () => this.syncMarketClock())
    } else {
      // Simulator → market is always "open" for paper testing
      this.om.setMarketOpen(true)
    }

    // System status heartbeat every 2s
    this.statusTimer = setInterval(() => this.broadcastStatus(), 2_000)

    // PnL snapshot every 60s
    this.pnlTimer = setInterval(() => this.recordPnlSnapshot(), 60_000)

    // ── Continuous observation / learning / vault (Phase 8) ─────────────────────
    // These run independently of the brain (which only learns on trade close).
    this.observer = new MarketObserver({
      getCandles: (s, l) => this.market.getCandles(s, l),
      getWatchlist: () => db.getWatchlist(),
    })
    this.learner = new PatternLearner({ getWatchlist: () => db.getWatchlist() })
    this.learner.initialize()
    this.observer.start()
    this.learner.start()

    this.vault = new VaultWriter({ projectRoot: resolveVaultRoot() })
    this.vault.initialize()

    // Session-start vault note
    this.fireAndForget('vault.writeSessionStart', () => this.vault.writeSessionStart(
      {
        id: this.currentSessionId, startedAt: this.startedAt, endedAt: null,
        startingEquity: DEFAULT_EQUITY, endingEquity: null,
        peakEquity: DEFAULT_EQUITY, troughEquity: DEFAULT_EQUITY,
        realizedPnl: 0, tradeCount: 0,
      },
      this.alpaca ? 'paper' : 'simulator',
      db.getWatchlist(),
    ))

    // Capture initial tactics state for transition detection
    this.lastTacticsState = this.tactics.status().state

    // ── Live crypto feed (BTC/ETH via Alpaca v1beta3 WebSocket) ──────────
    // Runs in parallel with whatever equity source is active. Alpaca's
    // crypto data is included with paper accounts and counts against a
    // separate connection budget from equities, so this never collides with
    // the IEX feed. fireAndForget so a crypto auth failure doesn't block
    // engine init.
    this.fireAndForget('startCryptoFeed', () => this.startCryptoFeed())

    // Broadcast Observer/Learner/Vault stats every 5s
    this.continuousStatsTimer = setInterval(() => this.broadcastContinuousStats(), 5_000)

    // ── Autonomous paper trader (Phase C, 2026-05-13) ─────────────────────────
    // Created in stopped state. User must explicitly enable via the toggle.
    // Refuses to submit when live capital is routed — paper-only by policy.
    this.autonomous = new AutonomousTrader({
      getWatchlist:  () => db.getWatchlist(),
      getQuote:      (s) => this.market.getQuote(s),
      getIndicators: (s) => computeSnapshot(s, this.market.getCandles(s, 200)),
      getAccount:    () => this.om.getAccount(),
      isLiveCapitalRouted: () => getAlpacaMode() === 'live' || isLive(),
      getDecision:   (s) => this.getAiDecision(s),
      submitOrder:   (req, opts) => this.submitOrder(req, opts),
    })
    this.autonomous.onStatus((s)   => { for (const fn of this.autonomousStatusListeners)   fn(s) })
    this.autonomous.onDecision((d) => { for (const fn of this.autonomousDecisionListeners) fn(d) })

    // ── Phase 10: SATEX Terminal v2 · Black Box ────────────────────────────
    // Depth feed first — regime can consume its VPIN proxy for the liquidity metric.
    this.depth = new DepthFeedService({
      getQuote: (s) => this.market.getQuote(s),
    })
    this.depth.onUpdate((s) => { for (const fn of this.depthListeners) fn(s) })
    this.depth.start()

    // Regime — HMM 4-state classifier on the focused symbol.
    this.regime = new RegimeService({
      getQuote:      (s) => this.market.getQuote(s),
      getCandles:    (s, l) => this.market.getCandles(s, l),
      getIndicators: (s) => computeSnapshot(s, this.market.getCandles(s, 200)),
      getVpin:       (s) => {
        const snap = this.depth.get(s)
        return snap.symbol === s ? snap.vpin : null
      },
    })
    this.regime.onUpdate((s) => { for (const fn of this.regimeListeners) fn(s) })
    this.regime.start()

    // Risk gates — 6 pre-trade guardrails.
    this.riskGates = new RiskGatesService({
      getAccount:      () => this.om.getAccount(),
      getQuote:        (s) => this.market.getQuote(s),
      getCandles:      (s, l) => this.market.getCandles(s, l),
      getPnlSnapshots: () => db.listPnlSnapshots(this.currentSessionId),
      // C2 alignment: panel must read the same baseline OM enforces against.
      getSessionStartEquity: () => this.om.getSessionStartEquity(),
    })
    this.riskGates.onUpdate((s) => { for (const fn of this.riskGatesListeners) fn(s) })
    this.riskGates.start()

    // Macro calendar — curated event ribbon.
    this.macro = new MacroCalendarService()
    this.macro.onUpdate((s) => { for (const fn of this.macroListeners) fn(s) })
    this.macro.start()

    // EDGAR catalysts — polls SEC for recent 8-K/10-Q/10-K/Form 4 on watchlist
    // symbols and pushes them as NewsItems through the existing news pipe.
    this.edgar = new EdgarService({ getWatchlist: () => db.getWatchlist() })
    this.edgar.onNews((item) => { for (const fn of this.newsListeners) fn(item) })
    this.edgar.start()

    // System logs tail — wraps the logger push channel (already initialized).
    this.logs.onTail((s) => { for (const fn of this.logsListeners) fn(s) })

    // Periodic observer/brain checkpoint to vault every 10 minutes
    this.vaultCheckpointTimer = setInterval(() => this.fireAndForget('writePeriodicCheckpoints', () => this.writePeriodicCheckpoints()), 10 * 60_000)

    // ── Overnight robustness (Phase D, 2026-05-13) ─────────────────────────────
    // Health heartbeat every 5 minutes so logs show heartbeat during long
    // unattended runs.
    this.healthLogTimer = setInterval(() => this.writeHealthLog(), 5 * 60_000)
    // Prune stale entryFeatures every hour to guarantee the map stays bounded
    // even if some sells fail to pair with their entries.
    this.entryCleanupTimer = setInterval(() => this.pruneEntryFeatures(), 60 * 60_000)

    // ── Tick-tape pruning (Phase 3.1, 2026-05-13) ──────────────────────────────
    // Bounded retention for the tape: keep TAPE_RETENTION_DAYS of tick rows.
    // Once at startup (clean up any backlog from before the pruner existed),
    // then daily during runtime.
    this.runTapePrune()
    this.tapePruneTimer = setInterval(() => this.runTapePrune(), 24 * 60 * 60_000)

    log.info('engine ready', { sessionId: this.currentSessionId })
  }

  /**
   * One-shot post-mount broadcast of fixture catalysts + historical candles.
   * Called from the IPC.SUBSCRIBE handler so we know the renderer's useIPC
   * effect has attached its listeners — pushes fired earlier (from inside
   * initialize()) can race the renderer mount and be dropped. Guarded by
   * `seedBroadcastDone` so HMR / devtools remounts don't re-seed.
   */
  broadcastInitialSeed(): void {
    if (this.seedBroadcastDone) return
    this.seedBroadcastDone = true
    this.seedInitialNews()
    // Candle backfill is heavy (Alpaca REST per symbol) — fire and forget.
    this.fireAndForget('seedHistoricalCandles', () => this.seedHistoricalCandles())
  }

  shutdown(): void {
    if (this.statusTimer)            { clearInterval(this.statusTimer);            this.statusTimer = null }
    if (this.accountSyncTimer)       { clearInterval(this.accountSyncTimer);       this.accountSyncTimer = null }
    if (this.clockSyncTimer)         { clearInterval(this.clockSyncTimer);         this.clockSyncTimer = null }
    if (this.pnlTimer)               { clearInterval(this.pnlTimer);               this.pnlTimer = null }
    if (this.continuousStatsTimer)   { clearInterval(this.continuousStatsTimer);   this.continuousStatsTimer = null }
    if (this.vaultCheckpointTimer)   { clearInterval(this.vaultCheckpointTimer);   this.vaultCheckpointTimer = null }
    if (this.healthLogTimer)         { clearInterval(this.healthLogTimer);         this.healthLogTimer = null }
    if (this.entryCleanupTimer)      { clearInterval(this.entryCleanupTimer);      this.entryCleanupTimer = null }
    if (this.tapePruneTimer)         { clearInterval(this.tapePruneTimer);         this.tapePruneTimer = null }
    if (this.replayStatusTimer)      { clearInterval(this.replayStatusTimer);      this.replayStatusTimer = null }
    if (this.batchTimer)             { clearTimeout(this.batchTimer);              this.batchTimer = null }
    if (this.tradeBatchTimer)        { clearTimeout(this.tradeBatchTimer);         this.tradeBatchTimer = null }
    // v0.4.3 B11 — release powerMonitor listeners so a re-initialize (HMR /
    // engine restart) doesn't pile up handlers. Bound arrow-class-fields
    // mean `off` finds the same reference as `on`.
    try { powerMonitor.off('suspend', this.onSystemSuspend) } catch { /* not registered */ }
    try { powerMonitor.off('resume',  this.onSystemResume)  } catch { /* not registered */ }
    this.recorder?.stop()
    this.replay?.stop()
    // A1 Sprint 3 — stop the periodic workers BEFORE forceSealAll so no
    // retention trim is in flight against a DB that's about to be closed.
    // Both stop() methods are idempotent + sync.
    this.subsecondRetention?.stop()
    this.subsecondTelemetry?.stop()
    // A1 (v0.4.4) — flush every in-flight sub-second bucket before db.closeDB
    // below truncates the WAL. forceSealAll runs synchronous prepare+run; safe
    // to call here. Subsequent operations on a closed DB would throw, hence
    // the order: seal → existing services stop → closeDB at the very end.
    try { this.subsecond?.forceSealAll() }
    catch (e) { log.warn('subsecond forceSealAll on shutdown failed', { err: String(e) }) }
    this.observer?.stop()
    this.learner?.stop()
    this.autonomous?.stop()
    this.regime?.stop()
    this.riskGates?.stop()
    this.macro?.stop()
    this.depth?.stop()
    this.edgar?.stop()
    this.market?.stop?.()
    this.alpaca?.disconnectMarketStream()
    this.alpaca?.disconnectAccountStream()
    this.alpaca?.disconnectCryptoStream()
    this.cryptoAlpaca?.disconnectCryptoStream()
    const endingEquity = this.om?.getAccount().equity ?? DEFAULT_EQUITY
    db.updateSession(this.currentSessionId, { endedAt: Date.now(), endingEquity })
    // Final vault checkpoint
    try {
      const finalSession = db.listSessions(1)[0]
      if (finalSession && this.vault) this.fireAndForget('vault.writeSessionEnd', () => this.vault.writeSessionEnd({ ...finalSession, endedAt: Date.now(), endingEquity }))
    } catch (e) { log.warn('final vault session-end write failed', { err: String(e) }) }
    db.closeDB()
    log.info('engine shutdown complete')
  }

  // ── Subscription API ────────────────────────────────────────────────────────
  onQuotes(fn: QuotesBatchListener):  () => void { this.quoteListeners.add(fn);   return () => this.quoteListeners.delete(fn) }
  onCandle(fn: CandleListener):       () => void { this.candleListeners.add(fn);  return () => this.candleListeners.delete(fn) }
  onBulkCandlesReplace(fn: (symbol: string, candles: Candle[]) => void): () => void {
    this.bulkCandlesListeners.add(fn)
    return () => this.bulkCandlesListeners.delete(fn)
  }
  onNews(fn: NewsListener):           () => void { this.newsListeners.add(fn);    return () => this.newsListeners.delete(fn) }
  onAccount(fn: AccountListener):     () => void { this.accountListeners.add(fn); return () => this.accountListeners.delete(fn) }
  onOrders(fn: OrdersListener):       () => void { this.ordersListeners.add(fn);  return () => this.ordersListeners.delete(fn) }
  onStatus(fn: StatusListener):       () => void { this.statusListeners.add(fn);  return () => this.statusListeners.delete(fn) }
  onObserverStats(fn: ObserverStatsListener): () => void { this.observerStatsListeners.add(fn); return () => this.observerStatsListeners.delete(fn) }
  onLearnerStats(fn: LearnerStatsListener):   () => void { this.learnerStatsListeners.add(fn);  return () => this.learnerStatsListeners.delete(fn) }
  onVaultStats(fn: VaultStatsListener):       () => void { this.vaultStatsListeners.add(fn);    return () => this.vaultStatsListeners.delete(fn) }
  onReplayStatus(fn: ReplayStatusListener):   () => void { this.replayStatusListeners.add(fn);  return () => this.replayStatusListeners.delete(fn) }
  onTradeClosed(fn: TradeClosedListener):     () => void { this.tradeClosedListeners.add(fn);   return () => this.tradeClosedListeners.delete(fn) }
  onTrades(fn: TradesListener):               () => void { this.tradesListeners.add(fn);        return () => this.tradesListeners.delete(fn) }
  onFeedStatus(fn: FeedStatusListener):       () => void { this.feedStatusListeners.add(fn);    return () => this.feedStatusListeners.delete(fn) }
  /** A1 (v0.4.4) — subscribe to sub-second crypto bar seals. main/index.ts
   *  wires this to IPC.SUBSECOND_CANDLES_UPDATE so the renderer chart can
   *  append the freshly-sealed bar instead of polling. */
  onSubsecondCandle(fn: SubSecondCandleListener): () => void { this.subsecondListeners.add(fn); return () => this.subsecondListeners.delete(fn) }

  /** A1 (v0.4.4) — initial-state fetch path. Renderer calls this on chart
   *  mount / timeframe switch to hydrate the series before live ticks start
   *  appending. Delegates to the persistence helper that scans the
   *  crypto_subsecond_candles table (most-recent `limit` rows, ascending). */
  getSubsecondCandles(symbol: string, bucketMs: number, limit: number): SubSecondCandle[] {
    return db.getSubSecondCandles(symbol, bucketMs, limit)
  }

  /** A1 Sprint 2 — subscribe to per-symbol bucket-pref changes. main/index.ts
   *  wires SubsecondPrefsService.setOne here so an IPC setSubsecondPref call
   *  is persisted to disk write-through. Returns an unsubscribe handle. */
  onSubsecondPrefChanged(fn: SubSecondPrefChangedListener): () => void {
    this.subsecondPrefListeners.add(fn)
    return () => this.subsecondPrefListeners.delete(fn)
  }

  /** A1 Sprint 2 — bulk hydrate the aggregator's per-symbol bucket prefs at
   *  app boot from disk-loaded state. Idempotent. No-op if the aggregator
   *  hasn't been constructed (engine not yet initialized) — main calls this
   *  AFTER engine.initialize() so that path is the standard. */
  hydrateSubsecondPrefs(prefs: Readonly<Record<string, PreferredBucket>>): void {
    this.subsecond?.hydratePreferredBuckets(prefs)
  }

  /** A1 Sprint 2 — snapshot of all per-symbol bucket prefs. Used by the
   *  SUBSECOND_PREFS_GET handler. Empty object when nothing has been set. */
  getSubsecondPrefs(): Record<string, PreferredBucket> {
    return this.subsecond?.getAllPreferredBuckets() ?? {}
  }

  /** A1 Sprint 2 — set the preferred default bucket for one crypto symbol.
   *  Aggregator rejects non-crypto symbols (returns current pref). Fires
   *  onPreferenceChanged → persistence write-through. Returns the post-update
   *  full prefs map so the IPC handler can echo it back to the renderer. */
  setSubsecondPref(symbol: string, ms: PreferredBucket): Record<string, PreferredBucket> {
    this.subsecond?.setPreferredBucket(symbol, ms)
    return this.getSubsecondPrefs()
  }

  /** Current per-asset-class feed status — used by main/index.ts to emit
   *  an initial-state push when the renderer subscribes. */
  getFeedStatus(): FeedStatus {
    return this.computeFeedStatus()
  }

  private computeFeedStatus(): FeedStatus {
    const cryptoClient = this.cryptoAlpaca ?? this.alpaca
    // Equity feed: live = Alpaca client present AND WS authenticated.
    // simulator = no Alpaca client (engine fell back to MarketSimulator).
    // off = Alpaca client built but WS down (creds saved, network bad, etc.).
    const equity: FeedStatus['equity'] = this.session
      ? (this.session.state === 'CONNECTED' ? 'live' : 'off')
      : 'simulator'
    // Futures: IEX has no futures coverage; values for ES/NQ/CL/GC come from
    // seedHistoricalCandles' synthetic GBM walk. Always 'synthetic' today.
    const futures: FeedStatus['futures'] = 'synthetic'
    const crypto: FeedStatus['crypto'] = (cryptoClient?.isCryptoConnected ?? false) ? 'live' : 'off'
    return { equity, futures, crypto }
  }
  /** Snapshot of recent closed-trades. Used by IPC initial-fetch so the
   *  renderer can hydrate the JournalPanel without waiting for new closes. */
  getClosedTrades(limit = 500): ClosedTrade[] { return this.closedTrades.slice(-limit) }
  /** Attach an exit-reflection (lesson + emotion tag) to a closed trade.
   *  Idempotent — calling twice with the same id just overwrites. The vault
   *  writer is told to append a reflection block to the trade-close markdown
   *  if it exists. Used by JOURNAL_REFLECT IPC. */
  applyTradeReflection(id: string, lesson: string, emotionTag?: JournalTag): ClosedTrade | null {
    const idx = this.closedTrades.findIndex(t => t.id === id)
    if (idx < 0) return null
    const updated: ClosedTrade = {
      ...this.closedTrades[idx]!,
      lesson: lesson || undefined,
      emotionTag,
    }
    this.closedTrades[idx] = updated
    for (const l of this.tradeClosedListeners) l(updated)
    if (this.vault) {
      const append = this.vault.appendTradeReflection
      if (append) this.fireAndForget('vault.appendTradeReflection', () => append.call(this.vault, updated))
    }
    return updated
  }
  onAutonomousStatus(fn: AutonomousStatusListener):     () => void { this.autonomousStatusListeners.add(fn);   return () => this.autonomousStatusListeners.delete(fn) }
  onAutonomousDecision(fn: AutonomousDecisionListener): () => void { this.autonomousDecisionListeners.add(fn); return () => this.autonomousDecisionListeners.delete(fn) }
  // Phase 10: Black Box service push hookups
  onRegimeUpdate(fn: RegimeListener):       () => void { this.regimeListeners.add(fn);    return () => this.regimeListeners.delete(fn) }
  onRiskGatesUpdate(fn: RiskGatesListener): () => void { this.riskGatesListeners.add(fn); return () => this.riskGatesListeners.delete(fn) }
  onMacroUpdate(fn: MacroListener):         () => void { this.macroListeners.add(fn);     return () => this.macroListeners.delete(fn) }
  onLogsTail(fn: LogsTailListener):         () => void { this.logsListeners.add(fn);      return () => this.logsListeners.delete(fn) }
  onDepthUpdate(fn: DepthListener):         () => void { this.depthListeners.add(fn);     return () => this.depthListeners.delete(fn) }

  // Phase 10: getters + symbol-switching for regime + depth
  getRegime():    RegimeSnapshot     { return this.regime.get() }
  getRiskGates(): RiskGatesSnapshot  { return this.riskGates.get() }
  getRiskGatesForPreview(req: OrderRequest): RiskGatesSnapshot { return this.riskGates.gatesForPreview(req) }
  getMacro():     MacroSnapshot      { return this.macro.get() }
  getLogsTail(n?: number): SystemLogsTail { return this.logs.getTail(n) }
  getDepth(symbol?: string): DepthSnapshot { return this.depth.get(symbol) }
  subscribeDepth(symbol: string): void {
    this.depth.subscribe(symbol)
    this.regime.setSymbol(symbol)
  }

  // ── Autonomous paper trader ─────────────────────────────────────────────────
  enableAutonomous():  { ok: boolean; reason?: string } { return this.autonomous.start() }
  disableAutonomous(): { ok: boolean } { return this.autonomous.stop() }
  getAutonomousStatus(): AutonomousStatus { return this.autonomous.getStatus() }
  getAutonomousConfig(): AutonomousConfig { return this.autonomous.getConfig() }
  getAutonomousRecent(): AutonomousDecision[] { return this.autonomous.getRecent() }
  setAutonomousConfig(patch: Partial<AutonomousConfig>): AutonomousConfig { return this.autonomous.setConfig(patch) }

  // ── Order API ───────────────────────────────────────────────────────────────
  async submitOrder(req: OrderRequest, opts?: { signalConfidence?: number }): Promise<{ ok: boolean; orderId?: string; reason?: string }> {
    // Hard block: no order submission during historical replay. The chart is
    // showing past data; submitting against `quote.last` from a replay source
    // would route to Alpaca priced on stale historical numbers — exactly the
    // fat-finger risk that originally motivated the (over-broad) isLive()
    // refusal in startReplay. With order submission blocked here, replay
    // itself can run freely while live-mode is armed: no path exists for a
    // historical-data click to move real capital.
    if (this.replay) {
      log.warn('order refused — replay active', { symbol: req.symbol, side: req.side })
      return { ok: false, reason: 'Order submission disabled during historical replay — stop replay to trade' }
    }
    if (this.switchingSource) {
      return { ok: false, reason: 'Data feed is switching — retry in a moment.' }
    }
    const quote = this.market.getQuote(req.symbol)
    // 2026-05-18 — explicit no-quote refusal under live mode. Pre-fix, when
    // `quote` was undefined (symbol never received a tick, just-subscribed,
    // feed gap on first request), OrderManager.validate fell through to its
    // `refPrice = equity / qty` synthesized fallback, then every buy tripped
    // Gate 5 (concentration) or Gate 6 (buying power) with a wildly
    // misleading "100% concentration" reason. Surface the actual cause here
    // so the trader sees "no quote available" instead of chasing a fake
    // concentration alarm. Paper/simulator mode keeps the old behavior since
    // refPrice fallback there is harmless and useful for offline testing.
    if (!quote && isLive() && req.side === 'buy') {
      log.warn('order refused — no quote in live mode', { symbol: req.symbol })
      return { ok: false, reason: `No quote available for ${req.symbol} — refusing live order` }
    }
    const refPrice = quote?.last ?? req.limitPrice ?? 0
    // Gate 0 (quote freshness) only fires for live-interlock orders, but we
    // compute the age unconditionally so the validator has the data it needs.
    // Quote.timestamp is set at every tick by the market source (live or sim).
    const refPriceAge = quote?.timestamp ? Date.now() - quote.timestamp : undefined
    const ctx: OrderValidationContext = {
      refPrice,
      ...(refPriceAge !== undefined ? { refPriceAge } : {}),
      liveMode: isLive(),
      notionalCap: getNotionalCap(),
      assetClass: quote?.assetClass ?? 'equity',
      signalConfidence: opts?.signalConfidence ?? 0.6,
      // Tactics gate fires for all buy entries. The old `!req.triggeredBy`
      // carve-out was tied to the same renderer-controlled field that
      // adversarial finding C1 closed out; with `triggeredBy` removed from
      // OrderRequest it can never be set, so the gate decision is just
      // "is this a buy?".
      tacticsGate: req.side === 'buy'
        ? (sc) => this.tactics.preTradeGate(sc)
        : undefined,
    }

    const validation = this.om.validate(req, ctx)
    if (!validation.ok) {
      log.warn('order rejected by risk engine', { reason: validation.reason, gate: validation.gate })
      return { ok: false, reason: validation.reason }
    }

    const order = this.om.createOrder(req)

    // Capture entry features for brain learning + vault narrative on close
    if (req.side === 'buy' && quote) {
      try {
        const ind = computeSnapshot(req.symbol, this.market.getCandles(req.symbol, 200))
        const features = this.brain.features(quote, ind)
        const recent = this.observer?.getRecent(req.symbol, 1) ?? []
        const regime = recent[0]?.regime ?? null
        this.entryFeatures.set(order.id, {
          symbol: req.symbol,
          features,
          notional: refPrice * req.quantity,
          regime,
          tactics: this.tactics.status(),
          aiDecision: null,  // set lazily on close if needed
          avgPrice: refPrice,
          openedAt: Date.now(),
          ...(req.tags && req.tags.length > 0 ? { tags: req.tags } : {}),
          ...(req.conviction !== undefined ? { conviction: req.conviction } : {}),
          // S1-6: stamp the reference quote so we can compute entry slippage
          // once Alpaca returns the actual fill price.
          ...(quote?.last ? { quoteAtSubmit: quote.last } : {}),
        })
      } catch (e) { log.debug('feature capture failed', { err: String(e) }) }
    }

    if (this.session) {
      try {
        const clientOrderId = randomUUID()
        const ack = await this.session.orders.submit({ ...req, clientOrderId })
        // F.1 L1.A 2.3: register broker→SATEX id mapping so onOrderEvent's FILL
        // handler can call om.fillOrder with the correct SATEX order id.
        // S1-6 slippage capture now happens in the async FILL handler — see onOrderEvent.
        this.brokerOrderIdToSatexId.set(ack.brokerOrderId, order.id)
        log.info('order acknowledged', { brokerOrderId: ack.brokerOrderId, clientOrderId })
      } catch (err) {
        this.om.rejectOrder(order.id, String(err))
        return { ok: false, reason: String(err) }
      }
    } else {
      const fillPrice = quote?.last ?? req.limitPrice ?? 0
      // Simulator path: fill == reference quote by construction, so slippage
      // is exactly 0 bps. Stamp it explicitly so the journal shows the value
      // rather than null.
      const ef = this.entryFeatures.get(order.id)
      if (ef) ef.entrySlippageBps = 0
      setTimeout(() => this.om.fillOrder(order.id, fillPrice), 50)
    }

    return { ok: true, orderId: order.id }
  }

  async cancelOrder(id: string): Promise<void> {
    if (this.session) { try { await this.session.orders.cancel(id) } catch (e) { log.warn('cancel failed', { id, err: String(e) }) } }
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
    const paperStored = getAlpacaCreds('paper')
    const liveStored  = getAlpacaCreds('live')
    const paperKeyId  = paperStored?.keyId ?? env.alpacaKeyId
    const paperSecret = paperStored?.secretKey ?? env.alpacaSecretKey
    const baseUrl     = resolveBaseUrl(env.alpacaBaseUrl)
    return {
      paperConfigured:      !!paperKeyId && !!paperSecret,
      liveConfigured:       !!liveStored?.keyId && !!liveStored?.secretKey,
      baseUrl,
      dataUrl:              env.alpacaDataUrl,
      feed:                 paperStored?.feed ?? liveStored?.feed ?? env.alpacaFeed,
      paperEndpointConfirmed: baseUrl.includes(ALPACA_PAPER_HOST),
    }
  }

  // ── Credentials (encrypted store) ───────────────────────────────────────────
  getCredentialsMasked(): CredentialsMaskedStatus { return getAlpacaCredsMasked() }
  setCredentials(req: CredentialsSetRequest): { ok: boolean; reason?: string } { return setAlpacaCreds(req) }
  clearCredentials(): { ok: boolean } { clearAlpacaCreds(); return { ok: true } }
  setBaiduKey(key: string): { ok: boolean; reason?: string } { return storeSetBaiduKey(key) }
  getBaiduMasked(): BaiduMaskedStatus { return storeGetBaiduMasked() }

  getDataSource(): DataSourceStatus {
    return {
      source:        this.dataSource,
      liveAvailable: !!getAlpacaCreds('paper'),
      switching:     this.switchingSource,
    }
  }

  /** Runtime swap between the synthetic simulator and the live Alpaca (paper)
   *  data feed. PREPARE (fallible — Alpaca REST auth) → COMMIT (local, atomic).
   *  On any failure the engine is never left source-less. The interlock decision
   *  is the pure, unit-tested evaluateDataSourceSwitch. */
  async setDataSource(target: DataSource): Promise<{ ok: boolean; reason?: string; source?: DataSource }> {
    const verdict = evaluateDataSourceSwitch({
      current:           this.dataSource,
      target,
      replayActive:      !!this.replay,
      realCapitalArmed:  isLive() || getAlpacaMode() === 'live',
      paperCredsPresent: !!getAlpacaCreds('paper'),
    })
    if (!verdict.ok)  return { ok: false, reason: verdict.reason }
    if (verdict.noop) return { ok: true, source: target }

    this.switchingSource = true
    this.regime?.pause()
    this.recorder?.pause()
    let toreDown = false
    try {
      if (target === 'live') {
        // PREPARE (fallible): Alpaca REST auth BEFORE any teardown.
        const creds = getAlpacaCreds('paper')!
        const env = getEnv()
        const alpaca = new AlpacaClient({
          keyId: creds.keyId, secretKey: creds.secretKey,
          baseUrl: resolveBaseUrl(env.alpacaBaseUrl), dataUrl: env.alpacaDataUrl, feed: creds.feed,
        })
        const acct = await alpaca.getAccount()
        const positions = (await alpaca.getPositions()).map(p => AlpacaClient.toSatexPosition(p, Date.now()))
        // COMMIT (local, atomic).
        this.uninstallMarketWiring(); toreDown = true
        await this.teardownSession()                  // tears down OLD session (data.stop + disconnectAccountStream + observer)
        this.alpaca = alpaca
        this.om.syncFromAlpaca({ equity: acct.equity, cash: acct.cash, buyingPower: acct.buyingPower }, positions)
        this.om.setSessionStartEquity(acct.equity)
        this.market = new LiveMarket(alpaca)
        this.session = AlpacaBrokerSession.create(alpaca, this.market)
        // F.1 L1.A 2.1: wire bracket-fill learning via OrderRouter.onUpdate.
        this.session.orders.onUpdate((e) => this.onOrderEvent(e))
      } else {
        // → Simulator: no fallible prep; tear down + reset to a clean paper world.
        this.uninstallMarketWiring(); toreDown = true
        await this.teardownSession()
        this.alpaca = null
        this.om.resetToPaper(DEFAULT_EQUITY)
        this.market = new MarketSimulator()
      }
      this.dataSource = target
      this.installMarketWiring(this.market)
      if (this.session) {
        await this.session.connect()
      } else {
        await (this.market as MarketDataSource & { start: () => void | Promise<void> }).start()
      }
      this.marketSubs.push(this.market.onQuotes(q => this.recorder?.ingest(q)))
      this.regime?.resume()
      this.recorder?.resume()
      this.switchingSource = false
      this.seedBroadcastDone = false
      this.broadcastInitialSeed()
      log.info('data source switched', { source: target })
      return { ok: true, source: target }
    } catch (err) {
      // PREPARE failure → nothing torn down, old source intact (clean no-op).
      // Failure after teardown → fall back to a fresh simulator (local, cannot
      // fail) so the engine is never left source-less.
      if (toreDown) {
        this.alpaca = null
        this.session = null
        this.om.resetToPaper(DEFAULT_EQUITY)
        this.market = new MarketSimulator()
        this.dataSource = 'simulator'
        this.installMarketWiring(this.market)
        try { await (this.market as MarketDataSource & { start: () => void | Promise<void> }).start() } catch { /* sim start is local */ }
        this.marketSubs.push(this.market.onQuotes(q => this.recorder?.ingest(q)))
        this.seedBroadcastDone = false
        this.broadcastInitialSeed()
      }
      this.regime?.resume()
      this.recorder?.resume()
      this.switchingSource = false
      log.warn('data source switch failed', { target, toreDown, err: String(err) })
      return { ok: false, reason: `Could not switch to ${target}: ${String(err)}` }
    }
  }

  /** Rebuild AlpacaClient + LiveMarket using freshly stored credentials for
   *  the currently-active mode. */
  async reconnectAlpaca(): Promise<{ ok: boolean; reason?: string }> {
    if (this.replay) return { ok: false, reason: 'stop replay before reconnecting' }
    const mode = getAlpacaMode()
    const stored = getAlpacaCreds(mode)
    if (!stored) return { ok: false, reason: `No stored credentials for ${mode} mode` }
    const env = getEnv()
    try {
      this.uninstallMarketWiring()
      await this.teardownSession()                    // tears down market + account WS + observer; falls back to market.stop() if no session
      const baseUrl = resolveBaseUrl(env.alpacaBaseUrl)
      const cfg: AlpacaConfig = {
        keyId: stored.keyId, secretKey: stored.secretKey,
        baseUrl, dataUrl: env.alpacaDataUrl,
        feed: stored.feed,
      }
      this.alpaca = new AlpacaClient(cfg)
      this.market = new LiveMarket(this.alpaca)
      this.session = AlpacaBrokerSession.create(this.alpaca, this.market)
      // F.1 L1.A 2.1: re-wire bracket-fill learning via OrderRouter.onUpdate on every reconnect.
      this.session.orders.onUpdate((e) => this.onOrderEvent(e))
      this.installMarketWiring(this.market)
      await this.session.connect()
      // Re-attach recorder ingest.
      this.marketSubs.push(this.market.onQuotes(q => this.recorder?.ingest(q)))
      this.fireAndForget('syncAlpacaAccount', () => this.syncAlpacaAccount())
      this.fireAndForget('syncMarketClock', () => this.syncMarketClock())
      log.info('alpaca reconnected', { mode, feed: stored.feed, baseUrl })
      return { ok: true }
    } catch (err) {
      log.error('reconnect failed', { err: String(err) })
      return { ok: false, reason: String(err) }
    }
  }

  // ── Alpaca endpoint mode (paper vs live URL) ────────────────────────────────
  getAlpacaModeStatus(): AlpacaModeStatus {
    const env = getEnv()
    const mode = getAlpacaMode()
    const paperStored = getAlpacaCreds('paper')
    const liveStored  = getAlpacaCreds('live')
    return {
      mode,
      paperConfigured: !!(paperStored?.keyId && paperStored?.secretKey) || (!!env.alpacaKeyId && !!env.alpacaSecretKey),
      liveConfigured:  !!(liveStored?.keyId  && liveStored?.secretKey),
      baseUrl: resolveBaseUrl(env.alpacaBaseUrl),
      connected: this.alpaca?.isMarketConnected ?? false,
    }
  }

  /**
   * Flip the Alpaca endpoint mode. Reconnects the AlpacaClient against the
   * new endpoint so subsequent REST calls and WS streams use the right host.
   * Refuses to flip to a mode with no stored credentials — caller must paste
   * keys first via Settings → save → setAlpacaMode.
   *
   * NOTE: This only changes which endpoint we *talk to*. It does NOT bypass
   * the live-mode typed-phrase interlock (live-mode.ts). And alpaca.ts:114
   * still hard-blocks submitOrder against the live REST endpoint until that
   * interlock is loosened.
   *
   * S0-4 dependency guard: we now require the typed-phrase interlock to be
   * armed BEFORE the endpoint can flip to 'live'. Previously the two walls
   * were independent, which let an operator flip the endpoint, then hit a
   * confusing "Live trading requires explicit consent" error from
   * alpaca.ts:114 when they tried to submit. That error implies the
   * endpoint is wrong, but the actual missing wall is the interlock — the
   * dependency-order guard surfaces the right diagnostic up front.
   */
  async setAlpacaModeMode(req: AlpacaModeSetRequest): Promise<{ ok: boolean; reason?: string; baseUrl?: string }> {
    if (this.replay) return { ok: false, reason: 'Stop replay before switching modes.' }
    if (req.mode === 'live') {
      if (!isLive()) {
        return {
          ok: false,
          reason: 'Live-mode interlock not armed. Open Live Mode panel, type the confirmation phrase, then retry.',
        }
      }
      const liveStored = getAlpacaCreds('live')
      if (!liveStored?.keyId || !liveStored?.secretKey) {
        return { ok: false, reason: 'No live credentials configured. Paste live keys in Settings first.' }
      }
    } else {
      const env = getEnv()
      const paperStored = getAlpacaCreds('paper')
      const hasPaperKey = (paperStored?.keyId && paperStored?.secretKey) || (env.alpacaKeyId && env.alpacaSecretKey)
      if (!hasPaperKey) {
        return { ok: false, reason: 'No paper credentials configured. Paste paper keys in Settings first.' }
      }
    }
    const result = storeSetAlpacaMode(req.mode)
    log.warn('alpaca endpoint mode flipped', { mode: req.mode, baseUrl: result.baseUrl })
    // Reconnect with new endpoint
    const rec = await this.reconnectAlpaca()
    if (!rec.ok) return { ok: false, reason: `Mode saved but reconnect failed: ${rec.reason}`, baseUrl: result.baseUrl }
    return { ok: true, baseUrl: result.baseUrl }
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
  graduateTactics(): { ok: boolean; reason?: string } {
    const before = this.tactics.status()
    const result = this.tactics.graduate()
    const after = this.tactics.status()
    if (result.ok && this.vault) {
      this.fireAndForget('vault.writeTacticsTransition', () => this.vault.writeTacticsTransition(before, after, 'Manual graduation by user'))
      this.lastTacticsState = after.state
    }
    return result
  }

  // ── Continuous Observer / PatternLearner / Vault (Phase 8) ──────────────────
  getObserverStats(): ObserverStats { return this.observer?.stats() ?? { running: false, totalObserved: 0, observationsPerMinute: 0, symbolsTracked: 0, bufferedRows: 0, lastFlushAt: null, lastFlushSize: 0 } }
  getLearnerStats():  LearnerStats  { return this.learner?.stats()  ?? { running: false, cycles: 0, lastCycleAt: null, lastCycleObservations: 0, lastCycleAvgError: 0, weightsTracked: 0 } }
  getVaultStats():    VaultStats    { return this.vault?.stats()    ?? { enabled: false, vaultRoot: null, notesWritten: 0, lastWriteAt: null, lastNotePath: null } }
  getLearnerWeights(): PatternWeight[] { return this.learner?.listWeights() ?? [] }
  async manualVaultCheckpoint(req: VaultCheckpointRequest): Promise<{ ok: boolean; path?: string }> {
    if (!this.vault) return { ok: false }
    const payload: Record<string, unknown> = {
      sessionId: this.currentSessionId,
      account: this.om?.getAccount() ?? null,
      tactics: this.tactics.status(),
      observer: this.getObserverStats(),
      learner: this.getLearnerStats(),
      brain: { params: db.listBrainParams().length },
    }
    const path = await this.vault.writeManualCheckpoint(req, payload)
    return { ok: !!path, path: path || undefined }
  }

  healthCheck(): { ok: boolean; uptime: number; mode: string } {
    return {
      ok:     true,
      uptime: Date.now() - this.startedAt,
      mode:   this.replay ? 'replay' : this.alpaca ? 'alpaca-paper' : 'simulator',
    }
  }

  // ── Phase 9: Replay engine ──────────────────────────────────────────────────

  /** Returns sessions that have recorded tape rows, for the picker UI. */
  listReplayableSessions(limit = 50): ReplayableSession[] {
    return db.listReplayableSessions(limit)
  }

  /** Returns the current replay status — synthesized whether or not active. */
  getReplayStatus(): ReplayStatus {
    if (!this.replay) {
      return {
        mode: 'recording',  // live recording is always running unless paused
        sessionId: this.currentSessionId,
        speed: 1,
        cursorTs: null,
        tapeStartTs: null,
        tapeEndTs: null,
        progress: null,
        emittedTicks: 0,
        bookmarks: [],
        autoPausedReason: null,
      }
    }
    const snap = this.replay.snapshot()
    return {
      mode: snap.paused ? 'paused' : 'playing',
      sessionId: snap.sessionId,
      speed: snap.speed,
      cursorTs: snap.cursorTs,
      tapeStartTs: snap.tapeStartTs,
      tapeEndTs:   snap.tapeEndTs,
      progress: snap.progress,
      emittedTicks: snap.emittedTicks,
      bookmarks: db.listBookmarks(snap.sessionId),
      autoPausedReason: snap.autoPausedReason,
    }
  }

  async startReplay(req: ReplayStartRequest): Promise<{ ok: boolean; reason?: string }> {
    if (this.replay) return { ok: false, reason: 'replay already active — stop first' }
    // Live-mode interlock used to block replay entirely here. That was too
    // coarse — analysis of a past day should never depend on whether the
    // user has armed real-capital posture. Risk is now contained at the
    // submitOrder gate (no orders during replay), so this entry path is open
    // regardless of isLive() state.
    //
    // Still refuse when open positions are unprotected by the kill switch:
    // unrealized PnL on those positions would be polluted by replay prices,
    // and the user might miss a real adverse move while reviewing history.
    if (this.om?.getAccount().killSwitchArmed === false && this.om?.getAccount().openPositions.length) {
      return { ok: false, reason: 'flatten or arm kill-switch before entering replay (open positions detected)' }
    }
    try {
      const source = new ReplaySource(req.sessionId, {
        speed:  req.speed,
        ...(req.fromTs !== undefined ? { fromTs: req.fromTs } : {}),
      })
      // Pause the recorder so replay quotes don't pollute the tape.
      this.recorder?.pause()
      // Suspend the live source — keep a reference so we can restore it.
      this.liveMarket = this.market
      this.uninstallMarketWiring()
      try { (this.liveMarket as MarketDataSource & { stop?: () => void }).stop?.() } catch { /* ignore */ }
      // Wire replay source in as the active market.
      this.market = source
      this.replay = source
      this.installMarketWiring(source)
      source.onTickEmitted = () => { /* status broadcast handled by timer */ }
      source.start()
      // Pause regime + risk-gates during replay — they consume live quotes that
      // are now frozen on the historical cursor; resuming on stopReplay below.
      this.regime?.pause()
      // Begin pushing replay status snapshots at 2 Hz.
      this.replayStatusTimer = setInterval(() => this.broadcastReplayStatus(), 500)
      this.broadcastReplayStatus()
      log.info('replay started', { sessionId: req.sessionId, fromTs: req.fromTs, speed: req.speed })
      return { ok: true }
    } catch (err) {
      this.recorder?.resume()
      log.error('replay start failed', { err: String(err) })
      return { ok: false, reason: String(err) }
    }
  }

  stopReplay(): { ok: boolean } {
    if (!this.replay) return { ok: true }
    try { this.replay.stop() } catch { /* ignore */ }
    this.uninstallMarketWiring()
    this.replay = null
    if (this.replayStatusTimer) { clearInterval(this.replayStatusTimer); this.replayStatusTimer = null }
    if (this.liveMarket) {
      this.market = this.liveMarket
      this.liveMarket = null
      this.installMarketWiring(this.market)
      try { void (this.market as MarketDataSource & { start: () => void | Promise<void> }).start() } catch { /* ignore */ }
      // Re-attach recorder ingest.
      this.marketSubs.push(this.market.onQuotes(q => this.recorder?.ingest(q)))
      this.recorder?.resume()
    }
    this.regime?.resume()
    // Phase 12 fix — the renderer's marketStore wipes candles on the
    // replay→live mode transition (useIPC.ts), so without a re-broadcast the
    // quad/main charts go flat until the next bar rolls over. Reseed here
    // pushes 200×1min historical bars back to candleListeners.
    this.seedBroadcastDone = false
    this.broadcastInitialSeed()
    this.broadcastReplayStatus()
    log.info('replay stopped — live source restored + history reseeded')
    return { ok: true }
  }

  pauseReplay():  { ok: boolean } { this.replay?.pause();  this.broadcastReplayStatus(); return { ok: !!this.replay } }
  resumeReplay(): { ok: boolean } { this.replay?.resume(); this.broadcastReplayStatus(); return { ok: !!this.replay } }

  seekReplay(ts: number): { ok: boolean } {
    if (!this.replay) return { ok: false }
    this.replay.seek(ts)
    this.broadcastReplayStatus()
    return { ok: true }
  }

  setReplaySpeed(speed: number): { ok: boolean; speed: number } {
    if (!this.replay) return { ok: false, speed: 0 }
    const s = this.replay.setSpeed(speed)
    this.broadcastReplayStatus()
    return { ok: true, speed: s }
  }

  addReplayBookmark(label: string): ReplayBookmark | null {
    if (!this.replay) return null
    const snap = this.replay.snapshot()
    if (snap.cursorTs == null) return null
    const b: ReplayBookmark = {
      id: shortId('bmk'),
      sessionId: snap.sessionId,
      ts: snap.cursorTs,
      label: label.trim() || `Bookmark @ ${new Date(snap.cursorTs).toISOString()}`,
      createdAt: Date.now(),
    }
    db.insertBookmark(b)
    this.broadcastReplayStatus()
    return b
  }

  deleteReplayBookmark(id: string): { ok: boolean } {
    db.deleteBookmark(id)
    this.broadcastReplayStatus()
    return { ok: true }
  }

  listReplayBookmarks(sessionId: string): ReplayBookmark[] { return db.listBookmarks(sessionId) }

  // ── Historical-day importer ─────────────────────────────────────────────────
  async importHistoricalDay(req: HistoricalImportRequest): Promise<HistoricalImportResult> {
    // Fall back to a REST-only AlpacaClient when the engine booted in
    // simulator mode (SATEX_USE_SIMULATOR=true, or no creds at boot) but the
    // user has since saved credentials. Without this fallback `this.alpaca`
    // is null and the importer fails with "No Alpaca credentials" even
    // though the credential store has perfectly good keys.
    const alpaca = this.alpaca ?? this.buildRestOnlyAlpacaClient()
    const importer = new HistoricalImporter(alpaca)
    return importer.import(req)
  }

  /** Replay-free historical bars for the chart's off-hours backfill. Reuses the
   *  same REST-only Alpaca fallback as importHistoricalDay so it works when the
   *  engine booted in simulator mode but the user has since saved credentials.
   *  Crucially this NEVER touches `this.replay`, `this.market`, wiring, or
   *  `dataSource` — it is a pure read, so the chart can show the last NY session
   *  without the Replay workspace taking over. */
  async getHistoricalBars(req: HistoricalBarsRequest): Promise<HistoricalBarsResult> {
    const alpaca = this.alpaca ?? this.buildRestOnlyAlpacaClient()
    const importer = new HistoricalImporter(alpaca)
    // Asset-class dispatch (2026-05-26): crypto trades 24/7 so "last completed
    // NY session date" doesn't apply — hit the v1beta3 crypto endpoint for the
    // last 24h instead. The IPC contract is unchanged; we look the class up
    // from UNIVERSE so the renderer doesn't need to know which feed runs.
    const entry = findUniverseEntry(req.symbol.trim().toUpperCase())
    if (entry?.assetClass === 'crypto') {
      return importer.fetchRecentCryptoBars(req.symbol, req.timeframe ?? '1Min')
    }
    return importer.fetchDayBars(req.symbol, req.date, req.timeframe ?? '1Min')
  }

  deleteReplaySession(sessionId: string): { ok: boolean; reason?: string } {
    if (this.replay && this.replay.snapshot().sessionId === sessionId) {
      return { ok: false, reason: 'Stop replay before deleting the active session.' }
    }
    // deleteSession is local-DB-only — no Alpaca call. Passing null is fine.
    const importer = new HistoricalImporter(this.alpaca)
    return importer.deleteSession(sessionId)
  }

  /** Connect Alpaca's crypto WebSocket for BTC/ETH live ticks. Runs
   *  alongside the equity market source (simulator OR live IEX) so crypto
   *  streams 24/7 regardless of US-equity market hours. No-op when no
   *  Alpaca credentials are saved or when no crypto symbols are in UNIVERSE.
   *  Reuses the existing buildRestOnlyAlpacaClient for the simulator-mode
   *  case so we don't tie crypto to the equity-feed lifecycle. */
  private async startCryptoFeed(): Promise<void> {
    const cryptoSymbols = UNIVERSE
      .filter(u => u.assetClass === 'crypto')
      .map(u => u.symbol)
    if (cryptoSymbols.length === 0) return
    const client = this.alpaca ?? this.buildRestOnlyAlpacaClient()
    if (!client) {
      log.info('crypto feed skipped — no Alpaca credentials')
      return
    }
    // Keep our own reference if we built a fresh client so we can disconnect
    // on shutdown. When reusing this.alpaca, the equity-side shutdown path
    // already handles disconnect.
    if (client !== this.alpaca) this.cryptoAlpaca = client
    client.onTick((tick) => this.onCryptoTick(tick))
    try {
      await client.connectCryptoStream(cryptoSymbols)
      log.info('crypto stream started', { symbols: cryptoSymbols })
    } catch (err) {
      log.warn('crypto stream failed to start', { err: String(err) })
    }
  }

  /** Convert a crypto AlpacaTick into a SATEX Quote and feed it through the
   *  engine's normal quote pipeline. The UNIVERSE seed is used as a baseline
   *  for prevClose — Alpaca's crypto endpoint doesn't ship a session-open
   *  reference and overnight crypto ticks have no analog to "prev close"
   *  anyway. The first real tick replaces the seed in marketStore.quotes
   *  so the chart, watchlist, and PnL all see live BTC/ETH. */
  private onCryptoTick(tick: AlpacaTick): void {
    const entry = findUniverseEntry(tick.symbol)
    if (!entry || entry.assetClass !== 'crypto') return
    // A1 (v0.4.4) — feed the sub-second aggregator before the quote build so a
    // throw in the aggregator's seal path (caught internally) can't shadow the
    // visible quote update. ingestTick filters kind !== 't' and non-crypto
    // symbols itself, but we've already verified the symbol so the second
    // check is cheap defense-in-depth.
    this.subsecond?.ingestTick(tick)
    const quote: Quote = {
      symbol:     tick.symbol,
      name:       entry.name,
      assetClass: entry.assetClass,
      last:       tick.price,
      bid:        tick.bid,
      ask:        tick.ask,
      prevClose:  entry.seed,
      change:     tick.price - entry.seed,
      changePct:  entry.seed === 0 ? 0 : ((tick.price - entry.seed) / entry.seed) * 100,
      // 2026-05-18 — only count traded size. Quote-update frames carry
      // bid_size + ask_size in tick.size; treating that as traded volume
      // inflated the watchlist crypto column.
      volume:     tick.kind === 't' ? tick.size : 0,
      vwap:       tick.price,
      sparkline:  new Array(30).fill(tick.price),
      timestamp:  tick.timestamp,
    }
    this.onQuotesBatch([quote])
  }

  /** Construct a REST-only AlpacaClient from currently-stored credentials,
   *  without touching `this.alpaca` or starting any WS connection. Used by
   *  features that need historical/account REST access (e.g. the chart
   *  historical-day importer) when the engine is running the simulator as
   *  its live market source. Returns null when no usable credentials exist
   *  on disk or in env — callers should still surface the original
   *  "no credentials" error in that case. */
  private buildRestOnlyAlpacaClient(): AlpacaClient | null {
    const env = getEnv()
    const mode = getAlpacaMode()
    const stored = getAlpacaCreds(mode)
    const keyId     = stored?.keyId     ?? (mode === 'paper' ? env.alpacaKeyId     : '')
    const secretKey = stored?.secretKey ?? (mode === 'paper' ? env.alpacaSecretKey : '')
    if (!keyId || !secretKey) return null
    const cfg: AlpacaConfig = {
      keyId, secretKey,
      baseUrl: resolveBaseUrl(env.alpacaBaseUrl),
      dataUrl: env.alpacaDataUrl,
      feed:    stored?.feed ?? env.alpacaFeed,
    }
    log.info('historical-import: built REST-only AlpacaClient (engine in simulator mode)', { mode, feed: cfg.feed })
    return new AlpacaClient(cfg)
  }

  /** Task 3 (2026-05-26) — fetch real Alpaca snapshots so MarketSimulator can
   *  start its GBM walk from realistic prices instead of the hardcoded
   *  UNIVERSE.seed. Returns undefined when no creds are available (so the
   *  simulator's log line can skip the noisy `hydratedSeeds: 0`). Bounded by
   *  a 1 s race so the "boot critical path under 1s" invariant from the
   *  2026-05-16 DB-compaction fix is preserved — typical Alpaca snapshot
   *  latency is 100-300 ms so this rarely times out in practice. Partial
   *  failures inside getLatestPrices are already swallowed there. */
  private async hydrateSimulatorSeedsBestEffort(): Promise<Map<string, number> | undefined> {
    const restClient = this.buildRestOnlyAlpacaClient()
    if (!restClient) return undefined
    const symbols = UNIVERSE.map(u => u.symbol)
    const TIMEOUT_MS = 1_000
    const hydrated = await Promise.race([
      restClient.getLatestPrices(symbols).catch(err => {
        log.warn('simulator seed hydration failed', { err: String(err) })
        return new Map<string, number>()
      }),
      new Promise<Map<string, number>>(resolve =>
        setTimeout(() => {
          log.warn('simulator seed hydration timed out — using UNIVERSE.seed', { timeoutMs: TIMEOUT_MS })
          resolve(new Map<string, number>())
        }, TIMEOUT_MS),
      ),
    ])
    return hydrated.size > 0 ? hydrated : undefined
  }

  /**
   * Prior trading-day H/L/C for a symbol — used by the Pivot Points
   * chart indicator (Phase 11). Pulls the last 7 daily bars from Alpaca
   * and returns the most-recent one strictly older than `today` so that
   * the levels are stable mid-session.
   *
   * Returns null when the symbol is not equity/index, Alpaca is offline,
   * or no completed prior-day bar is available yet (early Monday before
   * the prior Friday's bar has posted, weekends, etc.). Renderer treats
   * null as "insufficient data" and hides the lines.
   */
  async getPriorDayHlc(symbol: string): Promise<{ high: number; low: number; close: number; date: string } | null> {
    if (!this.alpaca) return null
    const sym = symbol.toUpperCase()
    // Equity-only — Alpaca daily-bars endpoint is /v2/stocks/.
    const entry = findUniverseEntry(sym)
    if (entry && entry.assetClass !== 'equity' && entry.assetClass !== 'index') return null

    const now = new Date()
    const start = new Date(now); start.setUTCDate(start.getUTCDate() - 10)
    const startIso = start.toISOString()
    try {
      const bars = await this.alpaca.getBars(sym, '1Day', startIso)
      if (bars.length === 0) return null
      // bars are time-ascending; find the most-recent one whose calendar day
      // is strictly before today (avoid an in-progress day if it ever shows up).
      const todayUtc = new Date(); todayUtc.setUTCHours(0, 0, 0, 0)
      const todayMs = todayUtc.getTime()
      for (let i = bars.length - 1; i >= 0; i--) {
        const b = bars[i]!
        const barMs = b.time * 1000
        if (barMs < todayMs) {
          const d = new Date(barMs)
          const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
          return { high: b.high, low: b.low, close: b.close, date: iso }
        }
      }
      return null
    } catch (e) {
      log.warn('getPriorDayHlc failed', { symbol: sym, err: String(e) })
      return null
    }
  }

  // ── Internal: market-source wiring lifecycle ────────────────────────────────

  private installMarketWiring(source: MarketDataSource): void {
    this.marketSubs.push(source.onQuotes((quotes) => this.onQuotesBatch(quotes)))
    this.marketSubs.push(source.onCandle((sym, c, isNew) => {
      for (const l of this.candleListeners) l(sym, c, isNew)
    }))
    // Bulk-snapshot path (ReplaySource only — LiveMarket/Simulator don't
    // implement this). Fans to engine-level bulk listeners that the main
    // IPC layer subscribes to. Skips silently when the source doesn't
    // expose the optional method.
    if (typeof source.onBulkCandlesReplace === 'function') {
      this.marketSubs.push(source.onBulkCandlesReplace((sym, candles) => {
        for (const l of this.bulkCandlesListeners) l(sym, candles)
      }))
    }
    this.marketSubs.push(source.onNews((item) => {
      for (const l of this.newsListeners) l(item)
    }))
    // P0-1 Footprint — fan trade events from whichever source is active.
    // ReplaySource's onTrades is a no-op so this is safe across hot-swaps.
    // 2026-05-18 — trade emissions batched on a 50ms window to match the
    // quote-batch cadence. Live-market fires once per tick (~20Hz × 18 sym =
    // ~360 ev/s); coalescing cuts the renderer IPC load by ~18×.
    this.marketSubs.push(source.onTrades((trades) => {
      if (trades.length === 0) return
      this.tradeBatch.push(...trades)
      if (this.tradeBatchTimer) return
      this.tradeBatchTimer = setTimeout(() => {
        this.tradeBatchTimer = null
        if (this.tradeBatch.length === 0) return
        const out = this.tradeBatch.splice(0)
        for (const l of this.tradesListeners) l(out)
      }, TradingEngine.TRADE_BATCH_MS)
    }))
  }

  private uninstallMarketWiring(): void {
    for (const u of this.marketSubs) { try { u() } catch { /* ignore */ } }
    this.marketSubs = []
  }

  /** Tear down whichever data source is currently active. Prefers
   *  `session.disconnect()` (drains in-flight orders via failUnacked,
   *  stops the market, disconnects the account WS, releases the state
   *  observer) when a session exists; falls back to a bare `market.stop()`
   *  for simulator/replay paths that don't have one. Used by the data-feed
   *  switch and reconnect paths. */
  private async teardownSession(): Promise<void> {
    if (this.session) {
      try { await this.session.disconnect() } catch (e) { log.warn('session.disconnect failed during teardown', { err: String(e) }) }
      this.session = null
    } else {
      try { (this.market as MarketDataSource & { stop?: () => void }).stop?.() } catch { /* ignore */ }
    }
  }

  private broadcastReplayStatus(): void {
    const status = this.getReplayStatus()
    for (const l of this.replayStatusListeners) l(status)
  }

  // ── Internal ─────────────────────────────────────────────────────────────────
  private onQuotesBatch(quotes: Quote[]): void {
    this.tickCount++
    const now = Date.now()
    this.lastTickAt = now
    // Rolling-1s tick rate. Drop stale entries, then push current.
    while (this.tickWindow.length > 0 && this.tickWindow[0]! < now - TradingEngine.TICK_WINDOW_MS) {
      this.tickWindow.shift()
    }
    this.tickWindow.push(now)
    // Update unrealized P&L for all positions
    for (const q of quotes) this.om.updatePositionPrice(q.symbol, q.last)
    // Continuous observer — runs independently of the brain
    try { this.observer?.ingestQuotes(quotes) } catch (e) { log.debug('observer ingest failed', { err: String(e) }) }
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
    // Crypto status — the active client is either the equity-side alpaca
    // (when live equity feed is up) or the dedicated cryptoAlpaca built in
    // simulator mode. Either one's cryptoWs is authoritative.
    const cryptoClient = this.cryptoAlpaca ?? this.alpaca
    // tickHz reads the rolling-window count directly. Also drop any stale
    // entries here so an idle period (no ticks) doesn't show a frozen
    // high number; the next broadcast sees an accurate decay.
    const nowStatus = Date.now()
    while (this.tickWindow.length > 0 && this.tickWindow[0]! < nowStatus - TradingEngine.TICK_WINDOW_MS) {
      this.tickWindow.shift()
    }
    const status: SystemStatus = {
      connected:   this.session ? this.session.state === 'CONNECTED' : true,
      mode:        this.alpaca ? 'paper' : 'simulator',
      tickHz:      this.tickWindow.length,
      latencyMs:   this.session ? this.session.data.msSinceLastTick() : 0,
      cpuPct:      0,
      memMb:       Math.round(mem.heapUsed / 1024 / 1024),
      uptime:      Math.floor((Date.now() - this.startedAt) / 1000),
      lastError:   null,
      lastTickIso: this.lastTickAt ? new Date(this.lastTickAt).toISOString() : null,
      crypto: {
        connected:         cryptoClient?.isCryptoConnected ?? false,
        subscribedSymbols: cryptoClient?.cryptoSubscribedCount ?? 0,
      },
    }
    for (const l of this.statusListeners) l(status)

    // B3 (2026-05-18) — diff-gated feed-status broadcast. Computed every status
    // tick (2s); listeners fire only on class transition so the renderer's
    // WatchlistPanel doesn't re-render on every heartbeat.
    const feed = this.computeFeedStatus()
    if (
      this.lastFeedStatus === null
      || this.lastFeedStatus.equity  !== feed.equity
      || this.lastFeedStatus.futures !== feed.futures
      || this.lastFeedStatus.crypto  !== feed.crypto
    ) {
      this.lastFeedStatus = feed
      for (const l of this.feedStatusListeners) l(feed)
    }
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
      const entry = this.entryFeatures.get(order.id) ?? null
      // Some sell orders are opened directly without a paired entry (e.g. close
      // of an Alpaca-synced position). Walk back through entryFeatures looking
      // for any open entry on this symbol when there is no direct match.
      const fallbackPair = entry ? null : this.findOpenEntryForSymbol(symbol)
      const fallbackId = entry ? order.id : fallbackPair?.[0] ?? null
      const fallback   = entry ?? (fallbackPair ? fallbackPair[1] : null)
      const fillPrice = order.fillPrice ?? 0
      this.recordTradeClose({
        symbol, quantity, fillPrice,
        entry: fallback, entryId: fallbackId,
        order, source: 'order-manager',
      })
    }
  }

  /**
   * Shared post-close pipeline. Called from two paths:
   *
   *   1. OrderManager.onOrderFill — for sells we routed through our OM
   *      (manual closes, simulator fills, autonomous-trader exits that we
   *      explicitly submit as separate orders).
   *
   *   2. OrderRouter.onUpdate (FILL event) — for server-side bracket children
   *      (stop-loss / take-profit legs) that fire on the exchange without
   *      ever round-tripping through our OrderManager. Pre-2026-05-13 these
   *      were silently dropped and the Brain never learned from them.
   *
   * Both paths agree on what "closing a position" means: realize PnL, run
   * SGD against the brain, update tactics history, write the vault note.
   */
  private recordTradeClose(args: {
    symbol: string
    quantity: number
    fillPrice: number
    entry: EntryFeaturesValue | null
    entryId: string | null
    order?: Order
    source: 'order-manager' | 'alpaca-bracket'
  }): void {
    const { symbol, quantity, fillPrice, entry, entryId, order, source } = args
    const realizedPnl = entry ? fillPrice * quantity - entry.notional : 0
    const tacticsBefore = this.tactics.status()
    this.tactics.recordOutcome(symbol, realizedPnl)
    const tacticsAfter = this.tactics.status()
    if (entry) this.brain.learn(realizedPnl, entry.notional, entry.features, 'buy')
    if (entryId) this.entryFeatures.delete(entryId)
    db.updateSession(this.currentSessionId, { tradeCount: db.listOrders(this.currentSessionId).length })
    log.info('learning hook fired', { symbol, realizedPnl: Math.round(realizedPnl * 100) / 100, source })

    if (this.vault && entry) {
      const syntheticPosition: Position = {
        symbol, quantity, avgPrice: entry.avgPrice,
        unrealizedPnl: 0, realizedPnl,
        openedAt: entry.openedAt,
      }
      // Synthesize an order record for bracket-path closes where we have no
      // real Order object — the vault writer expects one. The traceId is
      // tagged `bracket-synth-…` so post-mortem grep can distinguish these
      // from user-initiated orders that flowed through OrderManager.
      const syntheticId = `bracket-${symbol}-${Date.now()}`
      const orderForVault: Order = order ?? {
        id: syntheticId,
        traceId: `bracket-synth-${syntheticId}`,
        createdAt: Date.now(),
        filledAt:  Date.now(),
        status: 'filled' as const,
        fillPrice,
        request: {
          symbol, side: 'sell' as const, type: 'market' as const,
          quantity, source: 'alpaca-bracket',
        },
      }
      this.fireAndForget('vault.writeTradeClose', () => this.vault.writeTradeClose({
        order: orderForVault,
        position: syntheticPosition,
        pnl: realizedPnl,
        holdMs: Date.now() - entry.openedAt,
        aiDecision: entry.aiDecision,
        tacticsAtEntry: entry.tactics,
        regimeAtEntry: entry.regime,
      }))
    }

    // P0-2 — emit a typed ClosedTrade record so the JournalPanel can render
    // PnL-per-trade aggregates live. Always fires (independent of vault), so
    // even when the vault is disabled the panel still has data to show.
    if (entry) {
      const exitOrderId = order?.id ?? `bracket-${symbol}-${Date.now()}`
      const notional = entry.notional || (entry.avgPrice * quantity)
      const ct: ClosedTrade = {
        id: exitOrderId,
        symbol,
        side: 'long', // entries are always longs in this codebase (no shorts yet)
        quantity,
        entryPrice: entry.avgPrice,
        exitPrice:  fillPrice,
        pnl: realizedPnl,
        pnlPct: notional > 0 ? realizedPnl / notional : 0,
        holdMs: Date.now() - entry.openedAt,
        closedAt: Date.now(),
        // triggeredBy was removed from OrderRequest (adversarial finding C1).
        // Stop/TP fills from Alpaca bracket children land via onOrderEvent
        // (F.1 L1.A) and currently surface as `source: 'alpaca-bracket'`. Future
        // work: derive triggeredBy from OrderEvent fields.
        triggeredBy: null,
        source: order?.request.source ?? source,
        tags: entry.tags ?? [],
        conviction: entry.conviction ?? null,
        regimeAtEntry: entry.regime,
        // S1-6: propagate entry slippage captured at the buy fill.
        entrySlippageBps: entry.entrySlippageBps ?? null,
      }
      this.closedTrades.push(ct)
      if (this.closedTrades.length > TradingEngine.CLOSED_TRADES_CAP) {
        this.closedTrades.splice(0, this.closedTrades.length - TradingEngine.CLOSED_TRADES_CAP)
      }
      for (const l of this.tradeClosedListeners) l(ct)
    }

    if (this.vault && this.lastTacticsState !== tacticsAfter.state) {
      const reason = tacticsAfter.state === 'veto'
        ? `Drawdown or signal-quality threshold breached after ${tacticsAfter.tradesObserved} trades`
        : tacticsAfter.state === 'armed'
          ? `Graduated to armed after ${tacticsAfter.tradesObserved} trades`
          : `Recalibrating — metrics below floor`
      this.fireAndForget('vault.writeTacticsTransition', () => this.vault.writeTacticsTransition(tacticsBefore, tacticsAfter, reason))
      this.lastTacticsState = tacticsAfter.state
    }
  }

  /**
   * Canonical order-event handler (F.1 L1.A 2.1 / 2.3).
   *
   * Subscribed to OrderRouter.onUpdate via session.orders.onUpdate.
   * AlpacaOrderRouter translates every wire trade_update to an OrderEvent
   * before calling this handler — no Alpaca-specific parsing here.
   *
   * Handles two categories of FILL events:
   *   - Parent orders (submitted by the engine via submitOrder): discriminated
   *     by presence in brokerOrderIdToSatexId. Calls om.fillOrder with the
   *     SATEX order id, captures S1-6 slippage, then cleans up the map entry.
   *   - Bracket child orders (stop/TP, clientOrderId === ''): not in
   *     brokerOrderIdToSatexId. Symbol + side are carried on the FILL event
   *     (populated by AlpacaOrderRouter.translate) so we can route to
   *     recordTradeClose for brain learning.
   *
   * om.fillOrder is called exactly once per FILL event (either in the parent
   * path or not at all in the bracket-child path — recordTradeClose handles
   * its own accounting separately).
   */
  private onOrderEvent(e: OrderEvent): void {
    // Terminal events that aren't FILL: clean up the broker→satex map so
    // long-running sessions don't accumulate stale entries (e.g., orders
    // that were ACK'd but later rejected/canceled never enter the FILL path).
    if (e.execType === 'REJECT' || e.execType === 'CANCEL' || e.execType === 'EXPIRE') {
      this.brokerOrderIdToSatexId.delete(e.orderId)
      return
    }
    if (e.execType !== 'FILL') return  // Ignore ACK / PARTIAL_FILL

    // ── Parent-order path (F.1 L1.A 2.3) ──────────────────────────────────
    // The engine registered this mapping at submit time. If it's here, this
    // FILL belongs to an order the engine submitted, not a bracket child.
    const satexOrderId = this.brokerOrderIdToSatexId.get(e.orderId)
    if (satexOrderId !== undefined) {
      this.brokerOrderIdToSatexId.delete(e.orderId)  // one-shot; clean up immediately
      this.om.fillOrder(satexOrderId, e.avgPrice)
      // S1-6: slippage capture — moved here from the synchronous submitOrder
      // return path (L1.A 2.3). entryFeatures is only set for buy orders, so
      // this is a no-op for any future sell-entry orders.
      const ef = this.entryFeatures.get(satexOrderId)
      if (ef && ef.quoteAtSubmit != null && ef.quoteAtSubmit > 0) {
        ef.entrySlippageBps = (e.avgPrice - ef.quoteAtSubmit) / ef.quoteAtSubmit * 10_000
      }
      log.info('parent order filled', { brokerOrderId: e.orderId, satexOrderId, avgPrice: e.avgPrice })
      return
    }

    // ── Bracket-child path (F.1 L1.A 2.1) ─────────────────────────────────
    // For now we only learn from sell-fills that close a position we opened.
    // Buy-fills (covering shorts) would mirror — out of scope until shorts.
    if (e.side !== 'sell') return
    const symbol = e.symbol
    if (!symbol) return  // No symbol — cannot route to entry; should not occur for Alpaca fills.
    const found = this.findOpenEntryForSymbol(symbol)
    if (!found) {
      log.debug('alpaca bracket fill: no matching entry', { symbol, orderId: e.orderId })
      return
    }
    const [entryId, entry] = found
    this.recordTradeClose({
      symbol,
      quantity: e.filled,
      fillPrice: e.avgPrice,
      entry,
      entryId,
      source: 'alpaca-bracket',
    })
    // Refresh account snapshot so equity reflects the fill immediately
    // rather than waiting on the next 15s sync.
    this.fireAndForget('syncAlpacaAccount', () => this.syncAlpacaAccount())
  }

  /** Walk entryFeatures looking for the oldest open entry on this symbol.
   *  Returns the [id, value] pair so callers can delete after processing. */
  private findOpenEntryForSymbol(symbol: string): [string, EntryFeaturesValue] | null {
    let bestId: string | null = null
    let bestValue: EntryFeaturesValue | null = null
    let bestOpenedAt = Infinity
    for (const [id, v] of this.entryFeatures) {
      if (v.symbol === symbol && v.openedAt < bestOpenedAt) {
        bestId = id
        bestValue = v
        bestOpenedAt = v.openedAt
      }
    }
    return bestId && bestValue ? [bestId, bestValue] : null
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

      // Adversarial finding C2 (2026-05-16) — on the first sync of the session,
      // realign `sessionStartEquity` to the broker-reported equity AND persist
      // it to the session row. Before this fix, `sessionStartEquity` stayed at
      // the DEFAULT_EQUITY constant for the entire session, so Gate 3
      // (daily-loss limit) and the auto-arm kill switch worked off a baseline
      // that had no relationship to the user's real Alpaca equity.
      //
      // Only fires once per engine instance: subsequent syncs leave the
      // baseline intact (otherwise daily-loss tracking would never accumulate).
      // Guarded on snap.equity > 0 so a transient broker outage / new-account
      // response can't poison the baseline.
      if (!this.alpacaFirstSyncDone && snap.equity > 0) {
        this.alpacaFirstSyncDone = true
        this.om.setSessionStartEquity(snap.equity)
        try {
          db.updateSession(this.currentSessionId, {
            startingEquity: snap.equity,
            peakEquity:     snap.equity,
            troughEquity:   snap.equity,
          })
          log.info('session baseline aligned to alpaca equity', {
            sessionId: this.currentSessionId,
            startingEquity: snap.equity,
          })
        } catch (e) {
          log.warn('session baseline persist failed (in-memory still updated)', { err: String(e) })
        }
      }

      this.broadcastAccount()
    } catch (err) {
      log.warn('alpaca account sync failed', { err: String(err) })
    }
  }

  private broadcastContinuousStats(): void {
    const o = this.getObserverStats()
    const l = this.getLearnerStats()
    const v = this.getVaultStats()
    for (const fn of this.observerStatsListeners) fn(o)
    for (const fn of this.learnerStatsListeners)  fn(l)
    for (const fn of this.vaultStatsListeners)    fn(v)
  }

  private async writePeriodicCheckpoints(): Promise<void> {
    if (!this.vault?.stats().enabled) return
    const o = this.getObserverStats()
    const l = this.getLearnerStats()
    await this.vault.writeObserverCheckpoint({
      totalObserved: o.totalObserved,
      perMinute: o.observationsPerMinute,
      symbols: o.symbolsTracked,
      learnerCycles: l.cycles,
      learnerError: l.lastCycleAvgError,
      weightsTracked: l.weightsTracked,
    })
    // Brain checkpoint — read from db to get current params snapshot
    const params = db.listBrainParams()
    let bestKey: string | null = null
    let bestValue: number | null = null
    let bestAbs = 0
    for (const p of params) {
      const abs = Math.abs(p.value)
      if (abs > bestAbs) { bestAbs = abs; bestKey = p.key; bestValue = p.value }
    }
    const orderCount = db.listOrders(this.currentSessionId).length
    await this.vault.writeBrainCheckpoint({
      params: params.length,
      trades: orderCount,
      bestKey,
      bestValue,
      note: 'Periodic checkpoint — brain weights snapshot.',
    })
  }

  /**
   * Overnight-robustness helpers.
   *
   * writeHealthLog: emits a single info line summarising engine state so the
   * log file shows a heartbeat during long unattended runs. Look for these
   * lines to confirm "is it still alive?" without bringing up the UI.
   *
   * pruneEntryFeatures: caps memory growth from the entryFeatures Map. An
   * entry older than 24h is almost certainly orphaned (its sell was never
   * paired) and dropping it can't cost us much learning signal.
   */
  private writeHealthLog(): void {
    const mem = process.memoryUsage()
    const acct = this.om.getAccount()
    const auto = this.autonomous?.getStatus()
    log.info('health', {
      sessionId: this.currentSessionId,
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      heapMb: Math.round(mem.heapUsed / 1024 / 1024),
      rssMb:  Math.round(mem.rss      / 1024 / 1024),
      equity: Math.round(acct.equity),
      dailyPnl: Math.round(acct.dailyPnl),
      openPositions: acct.openPositions.length,
      ordersThisSession: db.listOrders(this.currentSessionId).length,
      alpacaConnected: this.alpaca?.isMarketConnected ?? false,
      msSinceLastTick: this.alpaca?.msSinceLastTick ?? null,
      autonomous: auto ? { enabled: auto.enabled, approved: auto.approvedCount, signals: auto.signalsFired } : null,
      entryFeaturesSize: this.entryFeatures.size,
    })
  }

  private pruneEntryFeatures(): void {
    const cutoff = Date.now() - 24 * 60 * 60_000
    let pruned = 0
    for (const [id, v] of this.entryFeatures) {
      if (v.openedAt < cutoff) { this.entryFeatures.delete(id); pruned++ }
    }
    if (pruned > 0) log.info('entryFeatures pruned', { pruned, remaining: this.entryFeatures.size })
  }

  private runTapePrune(): void {
    try {
      const maxAgeMs = TradingEngine.TAPE_RETENTION_DAYS * 24 * 60 * 60_000
      const pruned = db.pruneOldTicks(maxAgeMs)
      if (pruned > 0) log.info('tape pruned', { pruned, retentionDays: TradingEngine.TAPE_RETENTION_DAYS })
    } catch (e) {
      log.warn('tape prune failed', { err: String(e) })
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

  /**
   * Push fixture catalysts so the Catalysts/News panel renders immediately on
   * boot — before any simulator tick or Alpaca news poll. These are clearly
   * sourced as `SATEX/desk` so a downstream live-news adapter (Alpaca News
   * REST, RSS, etc.) can layer real items on top without dedup logic.
   */
  private seedInitialNews(): void {
    const SEED: Array<{ kind: NewsKind; symbol?: string; title: string; summary: string; sentiment: number; agoMin: number }> = [
      { kind: 'breaking', symbol: 'NVDA', title: 'NVDA Q3 beat: EPS $0.81 vs $0.74 cons',          summary: 'Data center revenue +56% YoY; Blackwell sampling ahead of schedule.',     sentiment:  0.55, agoMin:  3 },
      { kind: 'flow',     symbol: 'SPY',  title: 'Block tape · $620M SPY routed pre-open',           summary: 'Institutional desk crosses 1.0M shares; call skew widens at 610 strike.', sentiment:  0.20, agoMin:  9 },
      { kind: 'macro',                    title: 'EIA crude inventories −3.4MM vs −1.8MM cons',     summary: 'Larger-than-expected drawdown; gasoline build offsets crude tightness.', sentiment:  0.15, agoMin: 17 },
      { kind: 'earnings', symbol: 'AAPL', title: 'AAPL services revenue beats; iPhone in line',     summary: 'Services +14% YoY; gross margin 47.1% vs 46.5% est.',                    sentiment:  0.40, agoMin: 23 },
      { kind: 'sentiment',symbol: 'TSLA', title: 'TSLA short interest −12% w/w · retail net-long',   summary: 'First net-long retail positioning in 6 weeks; FTD count declining.',     sentiment:  0.30, agoMin: 31 },
      { kind: 'flow',     symbol: 'AMD',  title: 'AMD call volume 2.3× daily avg · MI400 prep',      summary: 'Heavy near-dated call activity into upcoming MI400 launch.',             sentiment:  0.25, agoMin: 42 },
      { kind: 'breaking',                 title: 'Fed minutes signal extended pause through Q2',     summary: 'Officials lean toward holding rates steady; dot plot unchanged.',        sentiment: -0.10, agoMin: 53 },
    ]
    const now = Date.now()
    for (const s of SEED) {
      const item: NewsItem = {
        id: shortId('seed'),
        source: 'SATEX/desk',
        kind: s.kind,
        ...(s.symbol ? { symbol: s.symbol } : {}),
        title: s.title,
        summary: s.summary,
        sentiment: s.sentiment,
        publishedAt: now - s.agoMin * 60_000,
      }
      for (const l of this.newsListeners) l(item)
    }
    log.info('seeded catalysts', { count: SEED.length })
  }

  /**
   * Backfill historical 1-minute bars for the quad-chart symbols + watchlist so
   * the charts render meaningful candles on first paint instead of a flat
   * seed-stub line. Two paths:
   *   1. Alpaca REST when configured + symbol is an equity/index ETF.
   *   2. Synthetic GBM walk for futures (ES/NQ/...) and crypto (BTC/ETH/...)
   *      or any symbol Alpaca rejects. Better than a flat line for visual
   *      verification.
   *
   * Pushed bars are also stamped into the LiveCandleBuffer history via
   * `seedHistory` so indicator computations (EMA9/21, VWAP, RSI) immediately
   * have a warm window.
   */
  private async seedHistoricalCandles(): Promise<void> {
    const QUAD = ['NVDA', 'SPY', 'ES', 'BTC']
    const symbols = Array.from(new Set<string>([...QUAD, ...db.getWatchlist()]))
    const BARS = 200
    const startIso = new Date(Date.now() - (BARS + 5) * 60_000).toISOString()
    let pushedFromAlpaca = 0
    let pushedSynthetic  = 0
    const lm = this.market as unknown as { seedHistory?: (s: string, c: Candle[]) => void }

    for (const sym of symbols) {
      const entry = findUniverseEntry(sym)
      if (!entry) continue
      const isAlpacaServable = (entry.assetClass === 'equity' || entry.assetClass === 'index')
      let bars: Candle[] | null = null

      // Path 1 — Alpaca REST for equities/ETFs.
      if (isAlpacaServable && this.alpaca?.isConfigured) {
        try {
          const fetched = await this.alpaca.getBars(sym, '1Min', startIso)
          if (fetched.length > 0) bars = fetched
        } catch (e) {
          log.debug('alpaca bars fetch failed — falling back to synth', { sym, err: String(e) })
        }
      }

      // Path 2 — synthetic GBM walk (futures, crypto, or Alpaca failure).
      if (!bars || bars.length === 0) {
        bars = synthBackfill(entry.seed, BARS)
        if (bars.length === 0) continue
        pushedSynthetic += bars.length
      } else {
        pushedFromAlpaca += bars.length
      }

      // Seed buffer history so indicators have warm data immediately
      lm.seedHistory?.(sym, bars)
      // Push each bar to the renderer (idempotent — store appends/replaces)
      for (const c of bars) {
        for (const l of this.candleListeners) l(sym, c, true)
      }
    }
    log.info('candle seed complete', {
      symbols: symbols.length,
      fromAlpaca: pushedFromAlpaca,
      synthetic:  pushedSynthetic,
    })
  }
}

/**
 * Tiny synthetic 1-minute OHLCV backfill — only used to keep charts visually
 * alive for symbols Alpaca won't serve (futures, crypto). Math.random is fine
 * here; this path is presentation-only and never feeds the brain/learner.
 */
function synthBackfill(seedPrice: number, bars: number): Candle[] {
  const out: Candle[] = []
  let p = seedPrice
  const nowSec = Math.floor(Date.now() / 1000)
  const stepSec = 60   // 1-minute bars
  // Align end to current minute boundary
  const endSec = Math.floor(nowSec / stepSec) * stepSec
  let t = endSec - bars * stepSec
  for (let i = 0; i < bars; i++) {
    const o = p
    let h = o, l = o
    const ticks = 20
    for (let j = 0; j < ticks; j++) {
      const z = Math.random() * 2 - 1
      p = p * Math.exp(0.0008 * z)
      if (p > h) h = p
      if (p < l) l = p
    }
    out.push({
      time: t,
      open: o, high: h, low: l, close: p,
      volume: 1000 + Math.floor(Math.random() * 5000),
    })
    t += stepSec
  }
  return out
}

/**
 * Resolves the Obsidian vault root by walking up from the Electron app path
 * looking for `.obsidian/`. Falls back to the OS home directory's mc4 folder
 * when not found — matches the user's confirmed vault location.
 */
function resolveVaultRoot(): string {
  const stops: string[] = []
  try { stops.push(app.getAppPath()) } catch { /* not yet ready in some paths */ }
  try { stops.push(process.cwd()) } catch { /* same */ }
  for (const start of stops) {
    let cur = resolve(start)
    for (let i = 0; i < 8; i++) {
      const candidate = join(cur, '.obsidian')
      if (existsSync(candidate) && statSync(candidate).isDirectory()) return cur
      const parent = dirname(cur)
      if (parent === cur) break
      cur = parent
    }
  }
  // Last-ditch fallback to the user's known mc4 vault location.
  try {
    const home = app.getPath('home')
    return join(home, 'mc4')
  } catch {
    return process.cwd()
  }
}
