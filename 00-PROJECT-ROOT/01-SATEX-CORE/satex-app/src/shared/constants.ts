/**
 * SATEX — Hard-coded operational constants.
 * Risk and determinism constants are load-bearing. Changes require test updates.
 */
import type { AssetClass } from './types'

export const STARTING_EQUITY = 100_000
export const DAILY_LOSS_LIMIT_PCT = 0.02
export const MAX_OPEN_POSITIONS = 3
export const MAX_POSITION_CONCENTRATION = 0.25
export const BUYING_POWER_MULT = 2

export const TICK_HZ = 20
export const BATCH_MS = 50

export const DEFAULT_SYMBOL = 'NVDA'
export const SPARKLINE_LENGTH = 30
export const MAX_CANDLES_PER_SYMBOL = 3600
export const SIMULATOR_CANDLE_INTERVAL_SEC = 1
export const CHART_TIMEFRAMES = ['1s', '5s', '15s', '1m', '5m', '15m'] as const
export type ChartTimeframe = typeof CHART_TIMEFRAMES[number]
export const CHART_TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  '1s': 1, '5s': 5, '15s': 15, '1m': 60, '5m': 300, '15m': 900,
}

export interface UniverseEntry {
  symbol: string
  name: string
  assetClass: AssetClass
  seed: number
  dp: number
}

export const UNIVERSE: readonly UniverseEntry[] = [
  // Index ETFs
  { symbol: 'SPY',  name: 'S&P 500 ETF',        assetClass: 'index',  seed: 608.45,    dp: 2 },
  { symbol: 'QQQ',  name: 'Nasdaq 100 ETF',      assetClass: 'index',  seed: 485.22,    dp: 2 },
  { symbol: 'DIA',  name: 'Dow Jones ETF',        assetClass: 'index',  seed: 378.90,    dp: 2 },
  { symbol: 'IWM',  name: 'Russell 2000 ETF',     assetClass: 'index',  seed: 218.40,    dp: 2 },
  // Futures (simulated via ETF proxies on Alpaca IEX)
  { symbol: 'ES',   name: 'E-mini S&P 500',       assetClass: 'future', seed: 5812.45,   dp: 2 },
  { symbol: 'NQ',   name: 'E-mini Nasdaq 100',    assetClass: 'future', seed: 18401.20,  dp: 2 },
  { symbol: 'CL',   name: 'Crude Oil Futures',    assetClass: 'future', seed: 91.23,     dp: 2 },
  { symbol: 'GC',   name: 'Gold Futures',         assetClass: 'future', seed: 2445.80,   dp: 2 },
  // Equities
  { symbol: 'AAPL', name: 'Apple Inc.',           assetClass: 'equity', seed: 195.30,    dp: 2 },
  { symbol: 'MSFT', name: 'Microsoft Corp.',      assetClass: 'equity', seed: 429.50,    dp: 2 },
  { symbol: 'NVDA', name: 'NVIDIA Corp.',         assetClass: 'equity', seed: 965.20,    dp: 2 },
  { symbol: 'TSLA', name: 'Tesla Inc.',           assetClass: 'equity', seed: 288.30,    dp: 2 },
  { symbol: 'AMD',  name: 'Adv. Micro Devices',  assetClass: 'equity', seed: 168.20,    dp: 2 },
  { symbol: 'META', name: 'Meta Platforms',       assetClass: 'equity', seed: 562.40,    dp: 2 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.',      assetClass: 'equity', seed: 218.94,    dp: 2 },
  { symbol: 'GOOGL',name: 'Alphabet Inc.',        assetClass: 'equity', seed: 201.50,    dp: 2 },
  // Crypto
  { symbol: 'BTC',  name: 'Bitcoin',              assetClass: 'crypto', seed: 103400.20, dp: 2 },
  { symbol: 'ETH',  name: 'Ethereum',             assetClass: 'crypto', seed: 3824.50,   dp: 2 },
] as const

export const UNIVERSE_SYMBOLS: readonly string[] = UNIVERSE.map((u) => u.symbol)

export const AUTONOMOUS_WATCHLIST: readonly string[] = [
  'NVDA', 'AMD', 'MSFT', 'AAPL', 'TSLA', 'META', 'IWM'
] as const

export const AUTONOMOUS_DEFAULTS = {
  confidenceThreshold: 0.60,
  maxConcurrentPositions: 3,
  maxPositionSizePct: 0.05,
  minRiskRewardRatio: 2.5,
  minRiskRewardFloor: 1.5
} as const

export const APRIL_TACTICS_DEFAULTS = {
  intervalMs: 30_000,
  notionalCapMin: 1_500,
  notionalCapMax: 3_000,
  // 300 × 1s candles = 5 minutes of warm-up; preserves prior semantics
  // when SIMULATOR_CANDLE_INTERVAL_SEC dropped from 5 to 1.
  minCandles: 300,
  cooldownMs: 300_000
} as const

export const DEFAULT_STOP_VOLATILITY_MULT = 2.0
export const DEFAULT_TAKE_PROFIT_VOLATILITY_MULT = 6.0
export const LEARNED_STOP_TP_FLOOR_RR = 2.5

export const REPLAY_DEFAULT_SPEED = 5
export const REPLAY_MIN_SPEED = 0.5
export const REPLAY_MAX_SPEED = 100

/** Symbols pre-checked in the Historical-Day importer UI when the user hasn't
 *  explicitly picked any. Covers indices + the most-liquid mega-caps so bars
 *  are reliably available on every US trading day, even far back. */
export const HISTORICAL_BARS_FALLBACK_SYMBOLS: readonly string[] = [
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META',
] as const

export const ALPACA_PAPER_HOST = 'paper-api.alpaca.markets'

export function findUniverseEntry(symbol: string): UniverseEntry | undefined {
  return UNIVERSE.find((u) => u.symbol === symbol)
}
