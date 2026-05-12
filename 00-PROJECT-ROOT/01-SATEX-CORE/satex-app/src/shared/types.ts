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
}

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
  feed: 'iex' | 'sip'
  endpoint: string
  keyIdMasked: string
}

export interface CredentialsSetRequest {
  keyId: string
  secretKey: string
  feed: 'iex' | 'sip'
}

export interface AnthropicMaskedStatus {
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
