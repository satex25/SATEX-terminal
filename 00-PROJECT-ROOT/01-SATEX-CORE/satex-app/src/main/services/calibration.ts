/**
 * SATEX — Confidence calibration (Brier score + reliability curve).
 *
 * Implements the constitution's "no confidence inflation" rule: stated
 * confidence is continuously compared against realized outcomes, and the
 * effective (calibrated) confidence used by the autonomous gate is
 * DOWNGRADED — never boosted — when the system is overconfident.
 *
 * Definitions over the rolling sample window (most recent WINDOW trades):
 *   - Brier score  = mean((confidence − outcome)²), outcome ∈ {0, 1}.
 *                    0 = oracle, 0.25 = uninformative coin at p=0.5.
 *   - Reliability  = 10 equal-width confidence buckets; per bucket the stated
 *                    avg confidence vs the realized win rate.
 *   - Multiplier   = clamp(winRate / avgConfidence, MULT_FLOOR, 1.0).
 *                    Applied only once MIN_SAMPLES outcomes exist. A system
 *                    that wins 45% of the time while claiming 75% confidence
 *                    gets its claims scaled by 0.6 at the decision choke
 *                    point (TradingEngine.decide). Never scales UP — an
 *                    underconfident system is a safe system.
 *
 * Wiring (all single-choke-point):
 *   - record():    TradingEngine.recordTradeClose — the one shared post-close
 *                  pipeline (manual, simulator, autonomous, bracket fills).
 *   - calibrate(): TradingEngine.decide — the one path every AiDecision
 *                  flows through (autonomous gate + AIInsights display).
 *
 * This service informs SIGNAL QUALITY only. It never touches risk limits —
 * the OrderManager gates and RISK constitution stay read-only to it.
 */
import type { CalibrationBucket, CalibrationSnapshot } from '@shared/types'
import * as db from './persistence'
import { createLogger } from './logger'

const log = createLogger('calibration')

/** Rolling window of most-recent outcomes considered "current behavior". */
const WINDOW = 200
/** Below this many samples, calibrate() is identity — don't tune on noise. */
const MIN_SAMPLES = 30
/** Hard floor on the downgrade multiplier so a cold streak can't zero the
 *  system into never trading again (the confidence threshold still gates). */
const MULT_FLOOR = 0.5
const BUCKET_COUNT = 10

export interface OutcomeSample {
  ts: number
  symbol: string
  confidence: number
  win: boolean
}

// ── Pure math (exported for unit tests) ────────────────────────────────────

export function computeBrier(samples: ReadonlyArray<OutcomeSample>): number | null {
  if (samples.length === 0) return null
  let acc = 0
  for (const s of samples) {
    const o = s.win ? 1 : 0
    acc += (s.confidence - o) ** 2
  }
  return acc / samples.length
}

export function computeBuckets(samples: ReadonlyArray<OutcomeSample>): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = []
  for (let i = 0; i < BUCKET_COUNT; i++) {
    buckets.push({ lo: i / BUCKET_COUNT, hi: (i + 1) / BUCKET_COUNT, n: 0, avgConfidence: 0, winRate: 0 })
  }
  for (const s of samples) {
    // confidence=1.0 belongs to the top bucket, not an 11th.
    const idx = Math.min(BUCKET_COUNT - 1, Math.floor(s.confidence * BUCKET_COUNT))
    const b = buckets[idx]!
    b.n += 1
    b.avgConfidence += s.confidence
    b.winRate += s.win ? 1 : 0
  }
  for (const b of buckets) {
    if (b.n > 0) { b.avgConfidence /= b.n; b.winRate /= b.n }
  }
  return buckets
}

export function computeMultiplier(samples: ReadonlyArray<OutcomeSample>): number {
  if (samples.length < MIN_SAMPLES) return 1
  let confAcc = 0
  let winAcc = 0
  for (const s of samples) { confAcc += s.confidence; winAcc += s.win ? 1 : 0 }
  const avgConf = confAcc / samples.length
  if (avgConf <= 0) return 1
  const winRate = winAcc / samples.length
  const ratio = winRate / avgConf
  // Downgrade-only: a system winning MORE than it claims keeps its claims.
  return Math.max(MULT_FLOOR, Math.min(1, ratio))
}

// ── Service ────────────────────────────────────────────────────────────────

export class CalibrationService {
  private samples: OutcomeSample[] = []

  /** Hydrate the rolling window from SQLite. Safe on NullDB (returns []). */
  initialize(): void {
    try {
      const pruned = db.pruneCalibrationLog(2_000)
      this.samples = db.listCalibrationSamples(WINDOW)
      log.info('calibration loaded', { samples: this.samples.length, pruned })
    } catch (e) {
      log.warn('calibration hydrate failed — starting empty', { err: String(e) })
      this.samples = []
    }
  }

  /** Record a realized outcome for a confidence-stamped entry. Called from
   *  TradingEngine.recordTradeClose; persistence failures never propagate
   *  into the close pipeline. */
  record(symbol: string, confidence: number, pnl: number): void {
    const sample: OutcomeSample = {
      ts: Date.now(),
      symbol,
      confidence: Math.max(0, Math.min(1, confidence)),
      win: pnl > 0,
    }
    this.samples.push(sample)
    if (this.samples.length > WINDOW) this.samples.shift()
    try { db.insertCalibrationSample(sample) }
    catch (e) { log.warn('calibration persist failed', { err: String(e) }) }
  }

  /** Effective confidence for gating/display. Identity until MIN_SAMPLES;
   *  downgrade-only thereafter. */
  calibrate(confidence: number): number {
    const mult = computeMultiplier(this.samples)
    return Math.max(0, Math.min(1, confidence * mult))
  }

  snapshot(): CalibrationSnapshot {
    return {
      samples: this.samples.length,
      minSamples: MIN_SAMPLES,
      brierScore: computeBrier(this.samples),
      buckets: computeBuckets(this.samples),
      multiplier: computeMultiplier(this.samples),
      computedAt: Date.now(),
    }
  }
}
