/**
 * SATEX — Domain Types
 * Every type used across the main/renderer boundary lives here.
 * Both processes import from @shared/types. NEVER duplicate these.
 */

export type AssetClass = 'equity' | 'index' | 'future' | 'crypto'

/** ── Per-trade event (P0-1 Footprint · 2026-05-15) ───────────────────────────
 *  Single executed trade as classified for footprint aggregation. Sources:
 *
 *   - **MarketSimulator** emits 'inferred' trades by classifying each tick
 *     against the prior tick: price ↑ = ask-lift (buy), price ↓ = bid-hit
 *     (sell), unchanged = the previous side. Size = the simulator's per-tick
 *     volume increment for that symbol.
 *
 *   - **AlpacaClient** (when SIP+L2 entitlement is detected) maps the `t.*`
 *     stream's executed-trade events 1:1 with `provenance: 'real'`.
 *
 *   - **ReplaySource** does not currently emit trades — the historical-import
 *     path doesn't carry trade-side info. Downstream consumers must tolerate
 *     an empty trade stream during replay.
 *
 *  Both renderer (footprint store) and engine (fan-out) consume this type;
 *  the IPC payload for TRADES_TICK is `Trade[]`. */
export type TradeSide = 'buy' | 'sell'
export interface Trade {
  symbol: string
  /** Epoch milliseconds. */
  ts: number
  price: number
  /** Aggressor-side size (share count, contract count, etc.). */
  size: number
  side: TradeSide
  /** 'real' = from Alpaca SIP trades stream. 'inferred' = reconstructed from
   *  quote tick direction (used in simulator and on free IEX feed). Consumers
   *  shading by provenance can dim inferred bars to signal lower confidence. */
  provenance: 'real' | 'inferred'
}

/** ── Workspace state (Phase 12 · 2026-05-15) ─────────────────────────────────
 *  Persisted to <project-root>/Vault/Settings/workspace-state.md so the app
 *  boots into the user's most-recent layout instead of always-Trade. Lives in
 *  shared/types so both main (sanitizer) and renderer (store/UI) can import
 *  without a cross-process module boundary. */
export const WORKSPACE_TABS = ['Trade', 'Focus', 'Markets', 'Replay', 'Quad'] as const
export type Workspace = (typeof WORKSPACE_TABS)[number]

export interface WorkspaceState {
  version: 1
  /** Last selected workspace. Restored on app mount. */
  workspace: Workspace
  /** Exactly 4 symbols shown in the Quad workspace, oldest-to-newest pane
   *  order matching `QuadChartPanel`. Validated against UNIVERSE on hydrate. */
  quadSymbols: string[]
  /** Last symbol the user focused on in Trade/Focus single-chart workspaces. */
  chartSymbol: string
}

/** Defaults — user explicit preference is Quad on boot per Phase 12 ask;
 *  the four pane symbols mirror the Phase 10.1 hardcoded set. */
export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  version: 1,
  workspace: 'Quad',
  quadSymbols: ['NVDA', 'SPY', 'ES', 'BTC'],
  chartSymbol: 'NVDA',
}

export interface Quote {
  symbol: string
  name: string
  assetClass: AssetClass
  last: number
  bid: number
  ask: number
  prevClose: number
  changePct: number
  change: number
  volume: number
  vwap: number
  sparkline: number[]
  timestamp: number
}

export interface Candle {
  time: number   // unix seconds (UTC)
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type NewsKind = 'breaking' | 'earnings' | 'macro' | 'flow' | 'sentiment'

export interface NewsItem {
  id: string
  source: string
  kind: NewsKind
  symbol?: string
  title: string
  summary: string
  /** -1..+1 (negative bearish, positive bullish). */
  sentiment: number
  publishedAt: number
}

export type OrderSide = 'buy' | 'sell'
export type OrderType = 'market' | 'limit' | 'stop'
export type OrderStatus = 'pending' | 'filled' | 'canceled' | 'rejected'

export interface OrderRequest {
  id?: string
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  limitPrice?: number
  stopLoss?: number
  takeProfit?: number
  source?: string
  /** Trading-journal metadata (Phase 11 — modern-terminal-survey §6).
   *  Carried from OrderTicketPanel through IPC into the engine; today the
   *  fields are accepted-and-ignored downstream, so adding them is safe.
   *  Wiring into vault-writer is a follow-up that will tag the closed trade
   *  markdown frontmatter for Obsidian Dataview aggregates. */
  tags?: string[]
  /** 1–10 self-rated entry conviction. Maps to signalConfidence internally. */
  conviction?: number
  // NOTE — `triggeredBy` was removed from OrderRequest 2026-05-16 (adversarial
  // finding C1). The renderer used to be able to set it to 'stop-loss' and
  // bypass the kill-switch / stale-quote / market-hours gates. Stop-loss
  // tagging is a server-side concern: when bracket child orders fill via the
  // AlpacaTradeUpdate stream, the engine can attach a `triggeredBy` value
  // directly to the ClosedTrade record without ever round-tripping through
  // OrderRequest.
}

/** Curated tag set surfaced in OrderTicketPanel. Stored on the order request
 *  for later journal aggregation. Keep this short and high-signal — proliferation
 *  defeats the purpose. */
export const JOURNAL_TAGS = [
  'planned',
  'breakout',
  'fade',
  'scalp',
  'swing',
  'revenge',
  'FOMO',
] as const
export type JournalTag = (typeof JOURNAL_TAGS)[number]

/** ── Closed-trade record (Phase 12 / P0-2 complete · 2026-05-15) ─────────────
 *  Emitted from TradingEngine.recordTradeClose() and pushed to the renderer
 *  via TRADE_CLOSED for the JournalPanel. Mirrors the trade-close markdown
 *  the vault writer produces but as a typed in-memory record so the panel
 *  doesn't need to read files. Capped at 500 entries (most-recent kept). */
export interface ClosedTrade {
  id: string
  symbol: string
  /** Direction of the ORIGINAL entry (long if the entry was a buy, short
   *  if the entry was a sell). Useful for PnL sign reasoning in the UI. */
  side: 'long' | 'short'
  quantity: number
  entryPrice: number
  exitPrice: number
  /** Realized PnL in dollars. Positive = win, negative = loss. */
  pnl: number
  /** PnL as a fraction of entry notional, signed. e.g. 0.012 = +1.2%. */
  pnlPct: number
  /** Position hold duration in milliseconds. */
  holdMs: number
  /** Wall-clock epoch-ms when the close fill landed. */
  closedAt: number
  /** Which auto-exit rail closed the trade (stop-loss / take-profit), or
   *  null for manual / autonomous-flat closes. Inline literal — there was a
   *  named TriggeredBy alias here that was removed 2026-05-19 after the
   *  dead-code audit found zero external consumers. */
  triggeredBy: 'stop-loss' | 'take-profit' | null
  /** Free-form source string from the entry order — 'ticket', 'autonomous',
   *  'alpaca-bracket', etc. */
  source: string
  /** Journal tags carried from the entry order. */
  tags: string[]
  /** Self-rated entry conviction (1-10), or null if unset. */
  conviction: number | null
  /** Regime state at entry — useful for per-regime aggregation in the panel. */
  regimeAtEntry: string | null
  /** Lesson captured via the exit-reflection prompt — set asynchronously
   *  after the trade closes if the user fills the prompt. May remain null. */
  lesson?: string
  /** Emotion tag captured via the exit-reflection prompt. */
  emotionTag?: JournalTag
  /** S1-6 — entry slippage in basis points: `(fillPriceAtEntry − quoteAtSubmit) /
   *  quoteAtSubmit × 10000`. POSITIVE means the user paid MORE than quoted at
   *  submit time (worse than expected). Null when the entry quote wasn't
   *  captured (e.g., simulator fills where fill==quote by construction, or
   *  Alpaca didn't return a filledAvgPrice). */
  entrySlippageBps?: number | null
}

export interface Order {
  id: string
  /** A4 — correlation id stamped at create time. Threaded through every log
   *  line that mentions the order (created/filled/rejected/canceled) so a
   *  post-mortem can reconstruct the full lifecycle by grepping the rotating
   *  log files for a single traceId. Persisted to the `orders.trace_id`
   *  column too — orders predating A4 read as `legacy-<id>`. */
  traceId: string
  createdAt: number
  filledAt?: number
  status: OrderStatus
  request: OrderRequest
  fillPrice?: number
  rejectionReason?: string
}

export interface Position {
  symbol: string
  /** Signed: positive = long, negative = short. */
  quantity: number
  avgPrice: number
  unrealizedPnl: number
  realizedPnl: number
  stopLoss?: number
  takeProfit?: number
  openedAt: number
}

export type AccountMode = 'paper' | 'live'

/** The market DATA feed in use — distinct from execution mode (AccountMode). */
export type DataSource = 'simulator' | 'live'

export interface DataSourceStatus {
  source: DataSource
  /** True when Alpaca paper creds are stored — i.e. 'live' is selectable. */
  liveAvailable: boolean
  /** True while a swap is in flight (chip shows a spinner, clicks ignored). */
  switching: boolean
}

export interface DataSourceSetRequest { target: DataSource }

export interface Account {
  equity: number
  cash: number
  buyingPower: number
  openPositions: Position[]
  dailyPnl: number
  dailyLossLimitPct: number
  mode: AccountMode
  killSwitchArmed: boolean
  sessionStartedAt: number
}

export interface IndicatorSnapshot {
  symbol: string
  vwap: number
  ema9: number
  ema21: number
  ema50: number
  rsi14: number
  atr14: number
  trendStrength: number
  volatility: number
}

export interface SessionRecord {
  id: string
  startedAt: number
  endedAt: number | null
  startingEquity: number
  endingEquity: number | null
  peakEquity: number
  troughEquity: number
  realizedPnl: number
  tradeCount: number
}

export interface PnlSnapshot {
  sessionId: string
  timestamp: number
  equity: number
  cash: number
  realizedPnl: number
  unrealizedPnl: number
}

export interface SystemStatus {
  connected: boolean
  mode: AccountMode | 'simulator'
  tickHz: number
  latencyMs: number
  cpuPct: number
  memMb: number
  uptime: number
  lastError: string | null
  lastTickIso: string | null
  /** Crypto-feed snapshot (separate Alpaca WebSocket — v1beta3/crypto/us).
   *  Runs in parallel with the equity source so BTC/ETH stream 24/7. */
  crypto: { connected: boolean; subscribedSymbols: number }
}

/** Per-asset-class feed status (B3, 2026-05-18). Drives the WatchlistPanel
 *  SIM badge so users can tell when a quote is from a live broker feed vs a
 *  synthetic seed walk. Pushed via FEED_STATUS_UPDATE whenever connection
 *  state changes; the renderer treats stale-feed symbols as not-live. */
export interface FeedStatus {
  /** Equity + index ETFs. 'live' = Alpaca IEX/SIP WS authenticated;
   *  'simulator' = MarketSimulator engine; 'off' = WS down with creds. */
  equity: 'live' | 'simulator' | 'off'
  /** Futures (ES/NQ/CL/GC). IEX does not carry futures — these are always
   *  synthetic GBM seeds in current build. 'live' will become valid once a
   *  CME-bridged feed lands; today it's always 'synthetic'. */
  futures: 'live' | 'synthetic'
  /** Crypto (BTC/ETH). Independent Alpaca v1beta3/crypto/us WS. */
  crypto: 'live' | 'off'
}

export interface AutonomousStatus {
  enabled: boolean
  lastDecisionAt: number | null
  approvedCount: number
  rejectedCount: number
  cooldownsActive: number
  signalsFired: number
}

export interface AutonomousDecision {
  id: string
  symbol: string
  approved: boolean
  reason: string
  confidence: number
  size: number
  riskReward: number
  createdAt: number
}

export interface BrainParameter {
  key: string
  symbol: string | null
  value: number
  sampleSize: number
  confidence: number
  updatedAt: number
}

export interface AlpacaCredentialsStatus {
  paperConfigured: boolean
  liveConfigured: boolean
  baseUrl: string
  dataUrl: string
  feed: 'iex' | 'sip'
  paperEndpointConfirmed: boolean
}

/**
 * Endpoint-mode toggle status. Owned by alpaca-mode.ts.
 * Distinct from LiveModeStatus (the typed-phrase interlock) — this only
 * selects which Alpaca REST URL the engine targets. The interlock still
 * gates whether real-capital orders are actually allowed through.
 */
export interface AlpacaModeStatus {
  mode: AccountMode
  paperConfigured: boolean
  liveConfigured: boolean
  baseUrl: string
  /** True iff the engine is currently connected through the resolved URL. */
  connected: boolean
}

export interface AlpacaModeSetRequest {
  mode: AccountMode
}

export interface AlpacaTradeUpdate {
  event: 'fill' | 'partial_fill' | 'canceled' | 'rejected' | 'new' | 'expired'
  orderId: string
  symbol: string
  side: OrderSide
  quantity: number
  filledQty: number
  price: number
  timestamp: number
}

export interface StrategySignal {
  setup: string
  symbol: string
  action: OrderSide
  confidence: number
  stopLossHint: number
  takeProfitHint: number
  atrHint: number
  createdAt: number
}

export interface OrderValidationResult {
  ok: boolean
  reason?: string
  gate?: string
}

export interface LiveModeStatus {
  enabled: boolean
  notionalCap: number
  endpoint: string
  paperOnly: boolean
}

export interface LiveModeSetRequest {
  enabled: boolean
  notionalCap: number
  // confirmPhrase removed 2026-05-16 (adversarial finding C6). Live-mode
  // enable is now gated by a native Electron modal triggered from the main
  // process — see main/index.ts IPC.LIVE_MODE_SET handler.
}

export interface CredentialsMaskedStatus {
  paperConfigured: boolean
  liveConfigured: boolean
  feed: 'iex' | 'sip'
  /** Endpoint for the currently-active mode (paper or live). */
  endpoint: string
  /** Masked key ID for the paper slot, or '' when not configured. */
  paperKeyIdMasked: string
  /** Masked key ID for the live slot, or '' when not configured. */
  liveKeyIdMasked: string
}

export interface CredentialsSetRequest {
  keyId: string
  secretKey: string
  feed: 'iex' | 'sip'
  /** Which slot to save into. Defaults to 'paper' if omitted (preserves
   *  backward compatibility with callers from before dual-mode was added). */
  mode?: AccountMode
}

/** Advisory-LLM configuration as exposed to the renderer. The API key itself
 *  never crosses the IPC boundary — only its existence (`configured`). */
export interface LlmStatus {
  configured: boolean
  baseUrl: string
  model: string
}

export interface LlmConfigSetRequest {
  baseUrl: string
  model: string
  /** Empty string = keep the previously stored key (provider/model-only change). */
  apiKey: string
}

/** Nightly self-eval surface for the Settings toggle + status line. */
export interface SelfEvalStatus {
  enabled: boolean
  running: boolean
  lastRun: {
    finishedAt: number
    evaluated: number
    skipped: number
    baselined: number
    regressions: number
    reportFilename: string
  } | null
}

// ── THE WIRE — toggleable live world-news desk (2026-06-10) ────────────────
export interface WireItem {
  /** `sourceId:guid-or-link` — globally unique, dedupe key. */
  id: string
  sourceId: string
  sourceLabel: string
  title: string
  link: string
  publishedAt: number
  fetchedAt: number
}

export interface WireSourceStatus {
  id: string
  label: string
  status: 'idle' | 'ok' | 'error'
  lastFetchAt: number | null
  count: number
}

export interface WireSnapshot {
  enabled: boolean
  /** Newest-first across all channels, capped. */
  items: WireItem[]
  sources: WireSourceStatus[]
  generatedAt: number
}

export interface CalibrationBucket {
  lo: number
  hi: number
  n: number
  avgConfidence: number
  winRate: number
}

/** Rolling confidence-vs-outcome health of the decision engine.
 *  See services/calibration.ts for the math + the downgrade-only rule. */
export interface CalibrationSnapshot {
  samples: number
  minSamples: number
  /** mean((confidence − outcome)²) over the window; null while empty. */
  brierScore: number | null
  buckets: CalibrationBucket[]
  /** Downgrade-only multiplier applied to stated confidence (1 = untouched). */
  multiplier: number
  computedAt: number
}

export interface AiDecision {
  symbol: string
  bias: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  localScore: number
  llmRationale: string | null
  veto: boolean
  vetoReason: string | null
  generatedAt: number
}

export interface TacticsStatus {
  state: 'calibrating' | 'armed' | 'veto'
  tradesObserved: number
  tradesRequired: number
  winRate: number
  expectancy: number
  maxDrawdown: number
  signalQuality: number
  vetoActive: boolean
  vetoReason: string | null
  lastUpdated: number
}

// ─── Continuous Observer / Pattern Learner / Vault (Phase 8) ─────────────────
// Entirely separate from Brain. Brain learns ONLY on trade close — these
// subsystems learn continuously from the live tick/candle stream.

export type MarketRegime = 'trend_up' | 'trend_down' | 'range' | 'chop' | 'unknown'

/** Single tick-rate observation. Append-only, time-series. */
export interface Observation {
  ts: number
  symbol: string
  last: number
  mid: number
  spreadBps: number
  /** Price delta vs 10 ticks ago, normalized as bps of last. */
  velocityBps: number
  ema9: number
  ema21: number
  ema50: number
  rsi14: number
  atr14: number
  vwap: number
  trendStrength: number
  regime: MarketRegime
}

/** Continuous-learning weight for one (feature, regime) pair. Entirely
 *  independent of the Brain SGD weights — different table, different lifecycle. */
export interface PatternWeight {
  feature: string
  regime: MarketRegime
  weight: number
  samples: number
  updatedAt: number
}

/** Audit row written every learning cycle. */
export interface LearningCycle {
  ts: number
  observationsSeen: number
  weightsUpdated: number
  avgError: number
  note: string
}

/** Observer runtime stats — pushed to renderer for status pip. */
export interface ObserverStats {
  running: boolean
  totalObserved: number
  observationsPerMinute: number
  symbolsTracked: number
  bufferedRows: number
  lastFlushAt: number | null
  lastFlushSize: number
}

/** PatternLearner runtime stats — pushed to renderer for status pip. */
export interface LearnerStats {
  running: boolean
  cycles: number
  lastCycleAt: number | null
  lastCycleObservations: number
  lastCycleAvgError: number
  weightsTracked: number
}

/** Vault writer stats — pushed to renderer for status pip. */
export interface VaultStats {
  enabled: boolean
  vaultRoot: string | null
  notesWritten: number
  lastWriteAt: number | null
  lastNotePath: string | null
}

/** Reason payload for a manual vault checkpoint trigger. */
export interface VaultCheckpointRequest {
  reason: string
  scope: 'session' | 'trade' | 'tactics' | 'brain' | 'observer' | 'manual'
  detail?: string
}

// ─── Replay engine (Phase 9) ─────────────────────────────────────────────────
// Recorded-tape playback over the same MarketDataSource interface used by
// MarketSimulator and LiveMarket. Same seed → bit-exact reproduction.

export type ReplayMode = 'idle' | 'recording' | 'playing' | 'paused'

/** One compressed snapshot per (timestamp, symbol). Append-only tape. */
export interface TickTapeRow {
  sessionId: string
  ts: number          // unix milliseconds
  symbol: string
  last: number
  bid: number
  ask: number
  volume: number      // cumulative session volume
  vwap: number
}

/** Marker placed on the scrubber for jump-back analysis. */
export interface ReplayBookmark {
  id: string
  sessionId: string
  ts: number
  label: string
  createdAt: number
}

/**
 * S1-10 — Tape integrity manifest. Sealed when a recording stops (or right
 * after a historical-day import materializes its synthetic tape), then
 * verified by ReplaySource on construction (open) and on stop (close).
 *
 * `manifestHash` is a hex SHA-256 over the canonical projection of the four
 * inputs below — see main/services/tape-integrity.ts. A bounds/count mismatch
 * at open time means rows were added, removed, or rewritten outside the
 * recorder's control (parallel record session, manual DB edit, corruption).
 */
export interface TapeManifest {
  sessionId:    string
  manifestHash: string    // 64-char hex SHA-256
  tickCount:    number
  firstTs:      number
  lastTs:       number
  /** Wall-clock millis when the manifest was sealed. */
  sealedAt:     number
}

/** Sessions surfaced to the picker — annotated with tape-availability metadata. */
export interface ReplayableSession {
  sessionId: string
  startedAt: number
  endedAt: number | null
  tickCount: number
  symbols: number
  firstTickTs: number | null
  lastTickTs: number | null
  durationMs: number
  realizedPnl: number
}

/** Pushed to renderer at REPLAY_STATUS_HZ during playback. */
export interface ReplayStatus {
  mode: ReplayMode
  sessionId: string | null
  speed: number
  /** Replay clock — current emitted timestamp inside the tape. */
  cursorTs: number | null
  /** Inclusive tape bounds for the active session. */
  tapeStartTs: number | null
  tapeEndTs:   number | null
  /** Progress in [0..1]. Null when idle. */
  progress: number | null
  /** Total ticks emitted since playback start (for diagnostics). */
  emittedTicks: number
  /** Bookmark list for the active session, lightweight echo. */
  bookmarks: ReplayBookmark[]
  /** Reason the engine paused itself, if any (e.g. "end-of-tape"). */
  autoPausedReason: string | null
}

export interface ReplayStartRequest {
  sessionId: string
  /** Optional jump-to timestamp inside the tape. */
  fromTs?: number
  /** Initial playback speed; clamped to [REPLAY_MIN_SPEED, REPLAY_MAX_SPEED]. */
  speed?: number
}

/** Historical-day import. Pulls Alpaca bars for `date` × `symbols` and
 *  materializes them as a synthetic replayable session in the tape table. */
export type HistoricalTimeframe = '1Min' | '1Hour' | '1Day'

export interface HistoricalImportRequest {
  /** YYYY-MM-DD (US Eastern session). Weekends / holidays / future dates rejected. */
  date: string
  symbols: string[]
  timeframe: HistoricalTimeframe
}

export interface HistoricalImportResult {
  ok: boolean
  reason?: string
  sessionId?: string
  tickCount?: number
  symbolsImported?: string[]
  skipped?: string[]
}

/** Request for a replay-free single-symbol day of OHLC bars (chart backfill). */
export interface HistoricalBarsRequest {
  /** Ticker (NVDA, SPY, …). */
  symbol: string
  /** YYYY-MM-DD (US Eastern session). Weekends / holidays / future dates rejected. */
  date: string
  /** Bar size — defaults to 1Min when omitted. */
  timeframe?: HistoricalTimeframe
}

export interface HistoricalBarsResult {
  ok: boolean
  reason?: string
  bars?: Candle[]
}

// ─── SATEX Terminal v2 · Black Box (Phase 10) ────────────────────────────────
// Session-aware terminal UI: HMM regime, pre-trade risk gates, macro calendar,
// system-log tail, real L2 depth. Each domain has its own main-process service
// and renderer Zustand store, fed via the IPC channels in ipc-channels.ts.

export type SessionId = 'TOKYO' | 'LONDON' | 'NY'

/** Single regime metric — value in [0,1], directional trend, short text label. */
export interface RegimeMetric { v: number; label: string; trend: number }

export type HmmStateName = 'EXPANSION' | 'MEAN-REVERT' | 'COMPRESSION' | 'CAPITULATION'

export interface RegimeSnapshot {
  /** Single-line state header e.g. "EXPANSION · LONDON LIQUIDITY". */
  state:       string
  session:     SessionId
  /** Symbol the snapshot was computed against (drives header context). */
  symbol:      string
  liquidity:   RegimeMetric
  /** Inverted display: lower is better (tight spreads = healthy). */
  spread:      RegimeMetric
  volatility:  RegimeMetric
  trend:       RegimeMetric
  hmm:         { name: HmmStateName; p: number }[]
  /** UTC ISO of last regime transition (state change), or null when stable. */
  lastSwitchUtc: string | null
  computedAt:  number
}

export type RiskGateStatus = 'OK' | 'WATCH' | 'BREACH'

/** One pre-trade risk gate. `pct` is the progress-bar value in [0,1]. */
export interface RiskGate {
  key:    string
  label:  string
  pct:    number
  status: RiskGateStatus
  /** Free-form value string for display, e.g. "−2.0% / −6.4% buf". */
  value:  string
}

export interface RiskGatesSnapshot {
  gates: RiskGate[]
  passingCount:  number
  watchingCount: number
  breachingCount: number
  computedAt:    number
}

export type MacroImpact = 'high' | 'med' | 'low'

export interface MacroEvent {
  id:     string
  /** Scheduled UTC ISO time. */
  tsUtc:  string
  label:  string
  cons:   string
  actual: string
  impact: MacroImpact
}

export interface MacroSnapshot {
  events:        MacroEvent[]
  horizonHours:  number
  computedAt:    number
}

/** Renderer-facing log entry. Mapped from main-process logger.LogEntry by
 *  system-logs.ts — fields aligned so the renderer can render either directly. */
export interface SystemLogEntry {
  /** Unix milliseconds. */
  ts:    number
  /** Normalized level — main-process logger emits lowercase, system-logs uppercases. */
  level: 'INFO' | 'WARN' | 'ERROR' | 'EVENT' | 'DEBUG' | 'TRACE'
  /** Source namespace, e.g. "tape", "algo", "lat", "hmm", "risk", "cat". */
  tag:   string
  msg:   string
}

export interface SystemLogsTail {
  /** Latest entries last. */
  lines: SystemLogEntry[]
}

export interface DepthLevel {
  /** Price. */
  p:    number
  /** Size at this level. */
  size: number
  /** Cumulative total from inside-the-book outward (top-of-book row first). */
  tot:  number
}

export interface DepthSnapshot {
  symbol:     string
  mid:        number
  /** Inside spread in price units. */
  spread:     number
  /** VPIN-like toxicity proxy in [0,1]. */
  vpin:       number
  /** Asks ascending in price (best ask = index 0). */
  asks:       DepthLevel[]
  /** Bids descending in price (best bid = index 0). */
  bids:       DepthLevel[]
  computedAt: number
}

export interface UpdateAvailable {
  available: boolean
  version?: string
  /** True once electron-updater has finished fetching the new installer.
   *  The renderer's [Restart Now] button stays disabled until this flips. */
  downloaded: boolean
}

/** A1 (v0.4.4) — sub-second crypto candle row. Identical shape to the
 *  persisted SubSecondCandleRow in persistence.ts; lives here too so the
 *  preload + renderer can import without crossing the main/renderer boundary
 *  on a service-layer type. openMs is the bucket-start in epoch ms;
 *  close-time = openMs + bucketMs. */
export interface SubSecondCandle {
  symbol:   string
  /** 250 or 500 today. Other values reserved for future bucket modes. */
  bucketMs: number
  openMs:   number
  open:     number
  high:     number
  low:      number
  close:    number
  volume:   number
}
