/**
 * SATEX — Domain Types
 * Every type used across the main/renderer boundary lives here.
 * Both processes import from @shared/types. NEVER duplicate these.
 */

export type AssetClass = 'equity' | 'index' | 'future' | 'crypto'

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
export type TriggeredBy = 'stop-loss' | 'take-profit'

export interface OrderRequest {
  id?: string
  symbol: string
  side: OrderSide
  type: OrderType
  quantity: number
  limitPrice?: number
  stopLoss?: number
  takeProfit?: number
  triggeredBy?: TriggeredBy
  source?: string
  /** Trading-journal metadata (Phase 11 — modern-terminal-survey §6).
   *  Carried from OrderTicketPanel through IPC into the engine; today the
   *  fields are accepted-and-ignored downstream, so adding them is safe.
   *  Wiring into vault-writer is a follow-up that will tag the closed trade
   *  markdown frontmatter for Obsidian Dataview aggregates. */
  tags?: string[]
  /** 1–10 self-rated entry conviction. Maps to signalConfidence internally. */
  conviction?: number
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

export interface Order {
  id: string
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

export interface Insight {
  id: string
  createdAt: number
  symbol: string
  text: string
  bias: 'bullish' | 'bearish' | 'neutral'
  confidence: number
  risk: number
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
  confirmPhrase: string
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

export interface BaiduMaskedStatus {
  configured: boolean
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

export interface CalendarImpact extends Number {}
export interface ForexEvent {
  id: string
  title: string
  currency: string
  impact: 1 | 2 | 3
  datetime: string
  forecast: string | null
  previous: string | null
  actual: string | null
}

export interface CalendarContext {
  imminentEvent: ForexEvent | null
  upcomingEvents: ForexEvent[]
  tradeRecommendation: 'TRADE' | 'CAUTION' | 'PAUSE'
  volatilityMultiplier: number
  timeUntilNextEvent: number | null
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
export type HistoricalTimeframe = '1Min' | '1Hour'

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
