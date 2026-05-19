/**
 * SATEX — Hard-coded operational constants.
 * Risk and determinism constants are load-bearing. Changes require test updates.
 */
import type { AssetClass } from './types'

/**
 * Default equity baseline. Used for:
 *   • OrderManager constructor default (overridden by `setSessionStartEquity`
 *     on the first Alpaca account sync — never trust this value at runtime
 *     once the engine is past initialize()).
 *   • Renderer-side display fallbacks (account store initial state,
 *     PortfolioPanel/PortfolioMiniPanel/OrderBar before the first
 *     ACCOUNT_UPDATE push arrives).
 *
 * 2026-05-19 (v0.4.3 B6): renamed from the prior "starting equity" symbol
 * to make the "default, not live" semantic explicit. The previous name
 * implied this was the active session-start equity, which it never is once
 * Alpaca sync fires — the v0.4 audit C2 finding rebases OrderManager's
 * baseline from this constant to the broker-reported value on first sync.
 */
export const DEFAULT_EQUITY = 100_000
export const DAILY_LOSS_LIMIT_PCT = 0.02
export const MAX_OPEN_POSITIONS = 3
export const MAX_POSITION_CONCENTRATION = 0.25
export const BUYING_POWER_MULT = 2

export const TICK_HZ = 20

export const SPARKLINE_LENGTH = 30
export const MAX_CANDLES_PER_SYMBOL = 3600
export const SIMULATOR_CANDLE_INTERVAL_SEC = 1
export const CHART_TIMEFRAMES = ['250ms', '500ms', '1s', '5s', '15s', '1m', '5m', '15m'] as const
export type ChartTimeframe = typeof CHART_TIMEFRAMES[number]
/** Bucket size in seconds. 250ms and 500ms are represented as fractional
 *  seconds — `aggregate()` uses bucketSec > 1 for in-renderer rollup of
 *  1-second base bars; sub-second timeframes bypass that path and read from
 *  the engine-aggregated `useSubsecondStore` instead, so a fractional bucket
 *  here is only used by the sub-second decision branch in ChartPanel. */
export const CHART_TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  '250ms': 0.25, '500ms': 0.5, '1s': 1, '5s': 5, '15s': 15, '1m': 60, '5m': 300, '15m': 900,
}
/** Bucket size in milliseconds. Sub-second timeframes consult this map when
 *  fetching from the engine's crypto_subsecond_candles table; >=1s timeframes
 *  fall back to CHART_TIMEFRAME_SECONDS * 1000. The split exists because
 *  the sub-second store is keyed by bucketMs (250 / 500) and a Math.round
 *  on 0.25 * 1000 / 0.5 * 1000 would obscure the contract. */
export const CHART_TIMEFRAME_MS: Record<ChartTimeframe, number> = {
  '250ms': 250, '500ms': 500, '1s': 1_000, '5s': 5_000, '15s': 15_000,
  '1m': 60_000, '5m': 300_000, '15m': 900_000,
}
export function isSubsecondTimeframe(tf: ChartTimeframe): boolean {
  return tf === '250ms' || tf === '500ms'
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

export const DEFAULT_STOP_VOLATILITY_MULT = 2.0
export const DEFAULT_TAKE_PROFIT_VOLATILITY_MULT = 6.0

export const REPLAY_DEFAULT_SPEED = 5
export const REPLAY_MIN_SPEED = 0.5
export const REPLAY_MAX_SPEED = 100
/** Replay-source emit cadence (Hz). Decoupled from the live-simulator
 *  TICK_HZ because replay benefits from finer-grained ticks: at 60Hz each
 *  tick advances the cursor by ~16.67ms × speed instead of 50ms × speed,
 *  so high-speed playback animates against a 60fps display without 50ms
 *  gaps between frames. 60Hz aligns the emit rate with the typical
 *  display refresh — no painted frame is ever "stale". */
export const REPLAY_TICK_HZ = 60

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
