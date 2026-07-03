/**
 * SATEX — Regime Service (Phase 10 · Black Box)
 *
 * HMM 4-state market regime classifier driving the Black Box RegimeDashboard.
 *
 * The four states (EXPANSION / MEAN-REVERT / COMPRESSION / CAPITULATION) are
 * inferred from feature vectors derived from existing IndicatorSnapshots + the
 * inside spread + recent volume profile. The HMM uses a Gaussian emission
 * model per state with hand-tuned means; the transition matrix is sticky
 * (regime-of-the-moment biased) per typical macro regime persistence.
 *
 * Updates every 2s (matches Black Box mockup's perceived cadence) and pushes
 * a normalized RegimeSnapshot. The current "focused" symbol drives both the
 * state header context and the underlying features — switching symbols
 * triggers a recompute immediately so the panel never lags.
 */
import type {
  RegimeSnapshot, RegimeMetric, SessionId, HmmStateName,
  Quote, Candle, IndicatorSnapshot,
} from '@shared/types'
import { atr } from '@shared/indicators'
import { createLogger } from './logger'

const log = createLogger('regime')

export type RegimeListener = (snap: RegimeSnapshot) => void

export interface RegimeDeps {
  getQuote:      (symbol: string) => Quote | undefined
  getCandles:    (symbol: string, limit?: number) => Candle[]
  getIndicators: (symbol: string) => IndicatorSnapshot
  /** Optional VPIN proxy from the depth feed — improves liquidity score when present. */
  getVpin?:      (symbol: string) => number | null
}

/** UTC hour → liquidity session (matches satex-terminal.jsx SX.sessionFor). */
function sessionForUtcHour(utcHour: number): SessionId {
  if (utcHour >= 0 && utcHour < 7)  return 'TOKYO'
  if (utcHour >= 7 && utcHour < 13) return 'LONDON'
  return 'NY'
}

const STATES: HmmStateName[] = ['EXPANSION', 'MEAN-REVERT', 'COMPRESSION', 'CAPITULATION']

/** Gaussian emission means per state, in the feature space
 *  [normVol, normTrend, normSpread, normVolume]. */
const STATE_MEANS: Record<HmmStateName, number[]> = {
  'EXPANSION':    [0.55, 0.70, 0.25, 0.60],
  'MEAN-REVERT':  [0.30, 0.20, 0.30, 0.45],
  'COMPRESSION':  [0.20, 0.15, 0.20, 0.30],
  'CAPITULATION': [0.85, 0.55, 0.65, 0.85],
}

const FEATURE_SIGMA = 0.22

/** Sticky transition matrix — diagonal heavily weighted so we don't flip
 *  state every cycle. Rows sum to 1; entries are P(next | current). */
const TRANSITION: Record<HmmStateName, Record<HmmStateName, number>> = {
  'EXPANSION':    { 'EXPANSION': 0.78, 'MEAN-REVERT': 0.14, 'COMPRESSION': 0.05, 'CAPITULATION': 0.03 },
  'MEAN-REVERT':  { 'EXPANSION': 0.22, 'MEAN-REVERT': 0.66, 'COMPRESSION': 0.10, 'CAPITULATION': 0.02 },
  'COMPRESSION':  { 'EXPANSION': 0.18, 'MEAN-REVERT': 0.20, 'COMPRESSION': 0.60, 'CAPITULATION': 0.02 },
  'CAPITULATION': { 'EXPANSION': 0.10, 'MEAN-REVERT': 0.12, 'COMPRESSION': 0.18, 'CAPITULATION': 0.60 },
}

const gaussian = (x: number, mu: number, sigma: number): number => {
  const z = (x - mu) / sigma
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI))
}

/** Normalize an array to sum to 1. */
function normalize(xs: number[]): number[] {
  const s = xs.reduce((a, b) => a + b, 0)
  if (s === 0) return xs.map(() => 1 / xs.length)
  return xs.map(x => x / s)
}

/** Clamp + map an unbounded metric into [0, 1] for the metric tile bar. */
function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

export class RegimeService {
  private deps: RegimeDeps
  private listeners: Set<RegimeListener> = new Set()
  private timer: NodeJS.Timeout | null = null
  private snapshot: RegimeSnapshot | null = null
  private currentSymbol: string = 'NVDA'
  /** Posterior over HMM states. Initialized uniform; updated each tick. */
  private posterior: number[] = [0.25, 0.25, 0.25, 0.25]
  /** Smoothed metrics — EMA against raw observations to dampen flicker. */
  private smoothLiquidity = 0.5
  private smoothSpread    = 0.5
  private smoothVolatility = 0.5
  private smoothTrend     = 0.5
  /** Trend baselines — used for the ▲/▼ arrows on each metric tile. */
  private prevLiquidity = 0.5
  private prevSpread    = 0.5
  private prevVolatility = 0.5
  private prevTrend     = 0.5
  /** Track the dominant state so we can stamp lastSwitchUtc on transitions. */
  private prevState: HmmStateName | null = null
  private lastSwitchUtc: string | null = null
  /** Paused during replay so renderer doesn't see thrashing regime against
   *  the live quote stream while user is watching historical data. */
  private paused = false

  constructor(deps: RegimeDeps) { this.deps = deps }

  start(intervalMs = 2000): void {
    if (this.timer) return
    this.recompute()
    this.timer = setInterval(() => { if (!this.paused) this.recompute() }, intervalMs)
    log.info('regime service started', { intervalMs, symbol: this.currentSymbol })
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  pause():  void { this.paused = true;  log.info('regime paused (replay active)') }
  resume(): void { this.paused = false; log.info('regime resumed'); this.recompute() }

  /** Symbol focus drives regime context — call when user changes the QuadChart
   *  primary or the watchlist selection. */
  setSymbol(symbol: string): void {
    if (symbol === this.currentSymbol) return
    this.currentSymbol = symbol
    // Reset posterior so context switch doesn't carry stale state probabilities.
    this.posterior = [0.25, 0.25, 0.25, 0.25]
    if (!this.paused) this.recompute()
  }

  get(): RegimeSnapshot {
    if (!this.snapshot) this.recompute()
    return this.snapshot!
  }

  onUpdate(fn: RegimeListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private extractFeatures(): { features: number[]; liq: number; spr: number; vol: number; tr: number; session: SessionId } {
    const sym = this.currentSymbol
    const quote = this.deps.getQuote(sym)
    const candles = this.deps.getCandles(sym, 80)
    const indicators = this.deps.getIndicators(sym)
    const vpin = this.deps.getVpin?.(sym) ?? null

    const last = quote?.last ?? 1
    const bid = quote?.bid ?? last
    const ask = quote?.ask ?? last

    // Spread feature: tight = low. Normalize bps spread to [0,1] with 5bps full.
    const spreadBps = last > 0 ? ((ask - bid) / last) * 10_000 : 0
    const normSpread = clamp01(spreadBps / 5)

    // Liquidity proxy: inverse of normSpread, optionally penalized by VPIN.
    let normLiq = 1 - normSpread
    if (vpin != null) normLiq *= clamp01(1 - vpin * 0.4)
    normLiq = clamp01(normLiq)

    // Volatility: from ATR14 normalized to last.
    const atr14 = atr(candles, 14)
    const normVol = clamp01((atr14 / Math.max(1e-9, last)) * 200)  // 0.5% ATR ⇒ 1.0

    // Trend strength: from EMA9 vs EMA21 divergence + RSI tilt.
    const e9 = indicators.ema9 || last
    const e21 = indicators.ema21 || last
    const div = e21 === 0 ? 0 : (e9 - e21) / e21
    const rsiTilt = (indicators.rsi14 - 50) / 50  // [-1, 1]
    const normTrend = clamp01(Math.abs(div) * 100 * 0.5 + Math.abs(rsiTilt) * 0.5)

    // Volume profile: recent vs trailing.
    let normVolume = 0.5
    if (candles.length >= 20) {
      const recent = candles.slice(-5).reduce((a, c) => a + c.volume, 0) / 5
      const trailing = candles.slice(-20, -5).reduce((a, c) => a + c.volume, 0) / 15
      normVolume = trailing > 0 ? clamp01(recent / trailing / 2) : 0.5
    }

    const utcHour = new Date().getUTCHours()
    const session = sessionForUtcHour(utcHour)

    return {
      features: [normVol, normTrend, normSpread, normVolume],
      liq:      normLiq,
      spr:      normSpread,
      vol:      normVol,
      tr:       normTrend,
      session,
    }
  }

  private emissionProb(features: number[], state: HmmStateName): number {
    const mu = STATE_MEANS[state]
    let p = 1
    for (let i = 0; i < features.length; i++) {
      p *= gaussian(features[i]!, mu[i]!, FEATURE_SIGMA)
    }
    return p
  }

  private hmmStep(features: number[]): number[] {
    // Predict: π_t|t-1 = π_t-1 · T
    const predicted: number[] = STATES.map(() => 0)
    for (let i = 0; i < STATES.length; i++) {
      for (let j = 0; j < STATES.length; j++) {
        predicted[j]! += this.posterior[i]! * TRANSITION[STATES[i]!]![STATES[j]!]!
      }
    }
    // Update: π_t|t ∝ predicted · emission
    const updated = predicted.map((p, j) => p * this.emissionProb(features, STATES[j]!))
    return normalize(updated)
  }

  private recompute(): void {
    const { features, liq, spr, vol, tr, session } = this.extractFeatures()

    // HMM step
    this.posterior = this.hmmStep(features)

    // EMA smoothing of display metrics
    const k = 0.35
    this.smoothLiquidity  = this.smoothLiquidity  * (1 - k) + liq * k
    this.smoothSpread     = this.smoothSpread     * (1 - k) + spr * k
    this.smoothVolatility = this.smoothVolatility * (1 - k) + vol * k
    this.smoothTrend      = this.smoothTrend      * (1 - k) + tr  * k

    // Dominant state (argmax posterior)
    let topIdx = 0
    for (let i = 1; i < STATES.length; i++) {
      if (this.posterior[i]! > this.posterior[topIdx]!) topIdx = i
    }
    const dominant = STATES[topIdx]!

    // Stamp lastSwitchUtc on dominant-state change
    if (dominant !== this.prevState) {
      if (this.prevState !== null) {
        this.lastSwitchUtc = new Date().toISOString()
        log.info('regime switch', { from: this.prevState, to: dominant, p: this.posterior[topIdx] })
      }
      this.prevState = dominant
    }

    const liquidity:  RegimeMetric = {
      v:     this.smoothLiquidity,
      label: this.smoothLiquidity > 0.7 ? 'DEEP'
           : this.smoothLiquidity > 0.4 ? 'NORMAL'
           :                              'THIN',
      trend: +(this.smoothLiquidity - this.prevLiquidity).toFixed(3),
    }
    const spread: RegimeMetric = {
      v:     this.smoothSpread,
      label: this.smoothSpread < 0.25 ? 'TIGHT'
           : this.smoothSpread < 0.55 ? 'NORMAL'
           :                            'WIDE',
      trend: +(this.smoothSpread - this.prevSpread).toFixed(3),
    }
    const volatility: RegimeMetric = {
      v:     this.smoothVolatility,
      label: this.smoothVolatility > 0.7 ? 'ELEVATED'
           : this.smoothVolatility > 0.4 ? 'NORMAL'
           :                                'COMPRESSED',
      trend: +(this.smoothVolatility - this.prevVolatility).toFixed(3),
    }
    const trend: RegimeMetric = {
      v:     this.smoothTrend,
      label: this.smoothTrend > 0.6 ? 'TRENDING'
           : this.smoothTrend > 0.3 ? 'DRIFTING'
           :                          'CHOPPY',
      trend: +(this.smoothTrend - this.prevTrend).toFixed(3),
    }

    this.prevLiquidity  = this.smoothLiquidity
    this.prevSpread     = this.smoothSpread
    this.prevVolatility = this.smoothVolatility
    this.prevTrend      = this.smoothTrend

    // Header: "STATE · SESSION LIQUIDITY"
    const stateLabel = dominant === 'EXPANSION'    ? 'EXPANSION'
                     : dominant === 'MEAN-REVERT'  ? 'MEAN-REVERT'
                     : dominant === 'COMPRESSION'  ? 'COMPRESSION'
                     :                               'CAPITULATION'
    const state = `${stateLabel} · ${session} LIQUIDITY`

    const hmm = STATES.map((name, i) => ({ name, p: +this.posterior[i]!.toFixed(3) }))

    this.snapshot = {
      state,
      session,
      symbol:        this.currentSymbol,
      liquidity,
      spread,
      volatility,
      trend,
      hmm,
      lastSwitchUtc: this.lastSwitchUtc,
      computedAt:    Date.now(),
    }
    for (const fn of this.listeners) fn(this.snapshot)
  }
}
