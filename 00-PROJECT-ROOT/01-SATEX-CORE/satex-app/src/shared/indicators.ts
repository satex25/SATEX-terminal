/**
 * SATEX — Pure indicator functions (main + renderer safe)
 * All functions are stateless and deterministic.
 * Input arrays are assumed oldest-first (index 0 = oldest).
 */

/** Exponential Moving Average over close prices. */
export function ema(closes: number[], period: number): number {
  if (closes.length === 0) return 0
  const k = 2 / (period + 1)
  let val = closes[0]!
  for (let i = 1; i < closes.length; i++) {
    val = closes[i]! * k + val * (1 - k)
  }
  return val
}

/** Simple Moving Average. */
export function sma(closes: number[], period: number): number {
  if (closes.length === 0) return 0
  const slice = closes.slice(-period)
  return slice.reduce((a, b) => a + b, 0) / slice.length
}

/** RSI-14 (Wilder smoothing). Returns 0-100. */
export function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50
  let gains = 0, losses = 0
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0)
    if (diff >= 0) gains += diff
    else losses -= diff
  }
  const avgGain = gains / period
  const avgLoss = losses / period
  if (avgLoss === 0) return 100
  const rs = avgGain / avgLoss
  return 100 - 100 / (1 + rs)
}

/** Average True Range over candles. */
export function atr(
  candles: Array<{ high: number; low: number; close: number }>,
  period = 14
): number {
  if (candles.length < 2) return 0
  const trs: number[] = []
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i]!.high
    const l = candles[i]!.low
    const pc = candles[i - 1]!.close
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)))
  }
  return sma(trs, period)
}

/** VWAP from open of session (volume-weighted). */
export function vwap(
  candles: Array<{ high: number; low: number; close: number; volume: number }>
): number {
  let numerator = 0, denominator = 0
  for (const c of candles) {
    const typical = (c.high + c.low + c.close) / 3
    numerator += typical * c.volume
    denominator += c.volume
  }
  return denominator === 0 ? 0 : numerator / denominator
}

/** Directional trend strength 0..1 based on EMA slope. */
export function trendStrength(closes: number[], period = 20): number {
  if (closes.length < period + 1) return 0
  const recent = ema(closes, period)
  const older = ema(closes.slice(0, -5), period)
  if (older === 0) return 0
  return Math.min(1, Math.abs((recent - older) / older) * 200)
}

/** Rolling volatility as a percentage of current price. */
export function rollingVolatility(closes: number[], period = 20): number {
  if (closes.length < 2) return 0
  const slice = closes.slice(-period)
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length
  const stddev = Math.sqrt(variance)
  return mean === 0 ? 0 : (stddev / mean) * 100
}

/** Compute full IndicatorSnapshot for a symbol from candle history. */
export function computeSnapshot(
  symbol: string,
  candles: Array<{ high: number; low: number; close: number; volume: number }>
): {
  symbol: string
  vwap: number
  ema9: number
  ema21: number
  ema50: number
  rsi14: number
  atr14: number
  trendStrength: number
  volatility: number
} {
  const closes = candles.map((c) => c.close)
  return {
    symbol,
    vwap: vwap(candles),
    ema9: ema(closes, 9),
    ema21: ema(closes, 21),
    ema50: ema(closes, 50),
    rsi14: rsi(closes, 14),
    atr14: atr(candles, 14),
    trendStrength: trendStrength(closes, 20),
    volatility: rollingVolatility(closes, 20),
  }
}
