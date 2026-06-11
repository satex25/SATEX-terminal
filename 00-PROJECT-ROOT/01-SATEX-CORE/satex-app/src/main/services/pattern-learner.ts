/**
 * SATEX — Continuous PatternLearner (Phase 8).
 *
 * Reads observations the MarketObserver wrote and learns weights for
 * (feature, regime) pairs against forward returns. This is OBSERVATIONAL — it
 * does NOT gate any trade and does NOT touch the brain table.
 *
 *   Brain (services/brain.ts):       SGD on closed-trade reward signal.
 *   PatternLearner (this file):      online regression on continuous
 *                                    forward-return labels, segmented by regime.
 *
 * Lifecycle: every CYCLE_MS, for each watched symbol, walk observations from
 * the last LOOKBACK_MS up to LABEL_HORIZON_MS ago. The label is the forward
 * return at LABEL_HORIZON_MS. Update pattern_weights[(feature,regime)] with
 * one SGD step per observation. Append a learning_log row per cycle.
 *
 * The PatternLearner intentionally never reads or writes the brain table.
 * The Brain intentionally never reads pattern_weights. Two systems, two
 * memories — exactly per the user's invariant.
 */
import type { LearnerStats, LearningCycle, Observation, PatternWeight, MarketRegime } from '@shared/types'
import { createLogger } from './logger'
import * as db from './persistence'

const log = createLogger('learner')

const CYCLE_MS         = 30_000
const LOOKBACK_MS      = 5 * 60_000   // 5 minutes of observations per cycle
const LABEL_HORIZON_MS = 60_000       // 1-minute forward return as label
const LR               = 0.005
const WEIGHT_CLAMP     = 1.5
const MIN_OBS_PER_CYCLE= 20

const FEATURE_KEYS = [
  'spread_bps_norm',   // tightness
  'velocity_bps_norm', // momentum
  'rsi_mid',           // RSI - 50
  'vwap_offset',       // (last - vwap) / vwap
  'ema_stack',         // {-1,0,+1} based on EMA ordering
  'trend_strength',
] as const
type FeatureKey = (typeof FEATURE_KEYS)[number]

const REGIMES: readonly MarketRegime[] = ['trend_up','trend_down','range','chop','unknown'] as const

export interface LearnerDeps {
  getWatchlist: () => string[]
}

export class PatternLearner {
  private deps: LearnerDeps
  private timer: NodeJS.Timeout | null = null
  private running = false
  /** weights[feature][regime] = { weight, samples } */
  private weights: Record<FeatureKey, Record<MarketRegime, { weight: number; samples: number }>>
  private cycles = 0
  /** P-001 (2026-06-10): high-water mark per symbol — the newest observation
   *  ts already labeled+learned. Without it, every observation inside the
   *  5-min lookback received the SAME gradient step on ~8 consecutive 30s
   *  cycles (effective LR ≈ 8×LR, sample counts inflated ~8×). In-memory by
   *  decision: a restart re-labels ≤5 min of observations exactly once —
   *  bounded and harmless vs. a schema change. See PROBLEM-LEDGER P-001. */
  private lastLabeledTs = new Map<string, number>()
  private lastCycleAt: number | null = null
  private lastCycleObservations = 0
  private lastCycleAvgError = 0

  constructor(deps: LearnerDeps) {
    this.deps = deps
    this.weights = makeEmptyWeights()
  }

  initialize(): void {
    // Hydrate from DB
    const stored = db.listPatternWeights()
    for (const w of stored) {
      if (!isFeatureKey(w.feature)) continue
      this.weights[w.feature][w.regime] = { weight: w.weight, samples: w.samples }
    }
    log.info('learner loaded', { storedWeights: stored.length })
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.timer = setInterval(() => void this.cycle(), CYCLE_MS)
    log.info('learner started', { cycleMs: CYCLE_MS, lookbackMs: LOOKBACK_MS, labelHorizonMs: LABEL_HORIZON_MS })
  }

  stop(): void {
    if (!this.running) return
    this.running = false
    if (this.timer) { clearInterval(this.timer); this.timer = null }
    log.info('learner stopped', { cycles: this.cycles })
  }

  stats(): LearnerStats {
    let count = 0
    for (const f of FEATURE_KEYS) for (const r of REGIMES) if (this.weights[f][r].samples > 0) count++
    return {
      running: this.running,
      cycles: this.cycles,
      lastCycleAt: this.lastCycleAt,
      lastCycleObservations: this.lastCycleObservations,
      lastCycleAvgError: this.lastCycleAvgError,
      weightsTracked: count,
    }
  }

  listWeights(): PatternWeight[] { return db.listPatternWeights() }

  // ── internal ────────────────────────────────────────────────────────────────

  /** One learning pass. Public for unit tests + on-demand triggers; the
   *  interval in start() is the production driver. */
  async cycle(): Promise<void> {
    const now = Date.now()
    const sinceTs = now - LOOKBACK_MS
    const labelCutoff = now - LABEL_HORIZON_MS  // can only label observations older than this

    let totalObs = 0
    let totalUpdated = 0
    let errAccum = 0
    let errCount = 0

    for (const symbol of this.deps.getWatchlist()) {
      const obs = db.listObservations(symbol, sinceTs, 5_000)
      if (obs.length < MIN_OBS_PER_CYCLE) continue
      totalObs += obs.length

      // For each observation that has at least LABEL_HORIZON_MS of subsequent
      // observations to derive a label, compute forward return and update.
      // The cursor guarantees ONE gradient step per observation across
      // overlapping cycles (P-001); rows are ts-ASC from listObservations.
      const cursor = this.lastLabeledTs.get(symbol) ?? 0
      let maxLabeled = cursor
      for (let i = 0; i < obs.length; i++) {
        const x = obs[i]!
        if (x.ts > labelCutoff) break  // not enough forward data yet
        if (x.ts <= cursor) continue   // already learned from this observation
        const label = forwardLogReturn(obs, i, LABEL_HORIZON_MS)
        if (label === null) continue   // no forward point yet — retry next cycle

        const features = featuresOf(x)
        const predicted = this.predict(features, x.regime)
        const error = label - predicted
        errAccum += Math.abs(error)
        errCount++

        for (const k of FEATURE_KEYS) {
          const cell = this.weights[k][x.regime]
          cell.weight = clamp(cell.weight + LR * error * features[k], -WEIGHT_CLAMP, WEIGHT_CLAMP)
          cell.samples += 1
        }
        totalUpdated++
        maxLabeled = x.ts
      }
      this.lastLabeledTs.set(symbol, maxLabeled)
    }

    this.cycles += 1
    this.lastCycleAt = now
    this.lastCycleObservations = totalObs
    this.lastCycleAvgError = errCount > 0 ? errAccum / errCount : 0

    if (totalUpdated > 0) {
      this.persist(now)
      log.debug('learner cycle', { totalObs, totalUpdated, avgErr: this.lastCycleAvgError.toFixed(4) })
    }

    const cycle: LearningCycle = {
      ts: now,
      observationsSeen: totalObs,
      weightsUpdated: totalUpdated,
      avgError: this.lastCycleAvgError,
      note: totalUpdated === 0 ? 'insufficient-observations' : 'ok',
    }
    try { db.insertLearningCycle(cycle) } catch (e) { log.warn('learning_log insert failed', { err: String(e) }) }
  }

  private predict(f: Record<FeatureKey, number>, regime: MarketRegime): number {
    let s = 0
    for (const k of FEATURE_KEYS) s += this.weights[k][regime].weight * f[k]
    return Math.tanh(s)
  }

  private persist(now: number): void {
    for (const k of FEATURE_KEYS) {
      for (const r of REGIMES) {
        const cell = this.weights[k][r]
        if (cell.samples === 0) continue
        const row: PatternWeight = { feature: k, regime: r, weight: cell.weight, samples: cell.samples, updatedAt: now }
        try { db.upsertPatternWeight(row) } catch (e) { log.warn('weight persist failed', { err: String(e) }) }
      }
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEmptyWeights(): Record<FeatureKey, Record<MarketRegime, { weight: number; samples: number }>> {
  const out = {} as Record<FeatureKey, Record<MarketRegime, { weight: number; samples: number }>>
  for (const f of FEATURE_KEYS) {
    out[f] = {} as Record<MarketRegime, { weight: number; samples: number }>
    for (const r of REGIMES) out[f][r] = { weight: 0, samples: 0 }
  }
  return out
}

function isFeatureKey(s: string): s is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(s)
}

function featuresOf(o: Observation): Record<FeatureKey, number> {
  const stack = o.ema9 > o.ema21 && o.ema21 > o.ema50 ? 1
              : o.ema9 < o.ema21 && o.ema21 < o.ema50 ? -1 : 0
  const vwapOffset = o.vwap > 0 ? (o.last - o.vwap) / o.vwap : 0
  return {
    spread_bps_norm:   Math.tanh(o.spreadBps / 5),
    velocity_bps_norm: Math.tanh(o.velocityBps / 20),
    rsi_mid:           (o.rsi14 - 50) / 50,
    vwap_offset:       Math.tanh(vwapOffset * 50),
    ema_stack:         stack,
    trend_strength:    clamp(o.trendStrength, -1, 1),
  }
}

/** Forward log-return at horizonMs from obs[i]. Returns null if no obs lies
 *  beyond horizonMs in the window. Result is bounded with tanh so it stays in
 *  the same scale as the predictor and keeps SGD updates well-conditioned. */
function forwardLogReturn(obs: Observation[], i: number, horizonMs: number): number | null {
  const x0 = obs[i]!
  for (let j = i + 1; j < obs.length; j++) {
    if (obs[j]!.ts - x0.ts >= horizonMs) {
      const r = (obs[j]!.last - x0.last) / Math.max(0.01, x0.last)
      return Math.tanh(r * 100)  // map a 1% move to ~0.76
    }
  }
  return null
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)) }
