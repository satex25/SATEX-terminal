/**
 * SATEX — AI Brain.
 *
 * Two-tier decision system:
 *   1. Local online-learning model (always on, no API key required).
 *      Linear scoring over technical features: emaStack, rsiMid, vwapSide,
 *      trendStrength, atrNormalized. Weights are updated by SGD using realized
 *      P&L of each trade as the reward signal. Weights persist via the brain
 *      table in SQLite.
 *
 *   2. Optional advisory LLM (provider-agnostic via services/llm.ts —
 *      any OpenAI-compatible endpoint: Groq, OpenAI, OpenRouter, Ollama,
 *      Baidu, …). Configured in Settings; falls back gracefully when no
 *      config is stored. ADVISORY ONLY — the rationale string never gates,
 *      sizes, or routes an order.
 */
import type { AiDecision, DepthSnapshot, IndicatorSnapshot, Quote, OrderSide, BrainParameter } from '@shared/types'
import { getLlmConfig } from './credential-store'
import { chatComplete, type LlmConfig } from './llm'
import * as db from './persistence'
import { createLogger } from './logger'

const log = createLogger('brain')

// ── Feature set (Tier-2 E.9: added microstructure features) ───────────────
const FEATURE_KEYS = [
  'ema_stack', 'rsi_mid', 'vwap_side', 'trend_strength', 'atr_norm',
  // Tier-2 E.9 — L2 depth signal. Defaults to 0 when no depth available.
  'depth_imbalance',   // (bidSize - askSize) / (bidSize + askSize) at top
  'microprice_dev',    // (microprice - last) / last in bps, clipped to [-1,1]
] as const
type FeatureKey = (typeof FEATURE_KEYS)[number]

interface Features {
  ema_stack: number; rsi_mid: number; vwap_side: number;
  trend_strength: number; atr_norm: number;
  depth_imbalance: number; microprice_dev: number;
}

const DEFAULT_WEIGHTS: Record<FeatureKey, number> = {
  ema_stack:      0.40,
  rsi_mid:        0.15,
  vwap_side:      0.20,
  trend_strength: 0.15,
  atr_norm:      -0.10,    // higher volatility → lower confidence
  depth_imbalance: 0.15,
  microprice_dev:  0.10,
}
const BIAS_KEY = 'bias_intercept'
const LR = 0.02          // learning rate
const SAMPLE_FLOOR = 5   // min samples before treating learned weight as preferred

export class Brain {
  private weights: Record<FeatureKey, number> = { ...DEFAULT_WEIGHTS }
  private bias = 0
  private sampleSize: Record<FeatureKey, number> = {
    ema_stack: 0, rsi_mid: 0, vwap_side: 0, trend_strength: 0, atr_norm: 0,
    depth_imbalance: 0, microprice_dev: 0,
  }
  private biasSampleSize = 0

  initialize(): void {
    const stored = db.listBrainParams()
    for (const p of stored) {
      if (p.symbol !== null) continue  // global brain only; per-symbol reserved for tactics
      if (p.key === BIAS_KEY) { this.bias = p.value; this.biasSampleSize = p.sampleSize; continue }
      if ((FEATURE_KEYS as readonly string[]).includes(p.key)) {
        const k = p.key as FeatureKey
        if (p.sampleSize >= SAMPLE_FLOOR) this.weights[k] = p.value
        this.sampleSize[k] = p.sampleSize
      }
    }
    log.info('brain loaded', { weights: this.weights, bias: this.bias })
  }

  features(quote: Quote, ind: IndicatorSnapshot, depth?: DepthSnapshot): Features {
    const emaStack      = ind.ema9 > ind.ema21 && ind.ema21 > ind.ema50 ? 1 : ind.ema9 < ind.ema21 && ind.ema21 < ind.ema50 ? -1 : 0
    const rsiMid        = (ind.rsi14 - 50) / 50  // [-1, +1]
    const vwapSide      = quote.last > ind.vwap ? 1 : -1
    const trendStrength = Math.max(-1, Math.min(1, ind.trendStrength))
    const atrNorm       = Math.max(0, Math.min(1, ind.atr14 / Math.max(0.01, quote.last) * 50))

    // ── Tier-2 E.9 — L2 microstructure features ────────────────────────────
    let depthImbalance = 0
    let micropriceDev  = 0
    if (depth && depth.bids?.length && depth.asks?.length) {
      const bidTop = depth.bids[0]!
      const askTop = depth.asks[0]!
      const totSize = bidTop.size + askTop.size
      if (totSize > 0) {
        depthImbalance = (bidTop.size - askTop.size) / totSize
        // microprice — size-weighted mid (heavier book side pulls mid toward
        // the OPPOSITE side, predicting next tick direction).
        const microprice = (bidTop.p * askTop.size + askTop.p * bidTop.size) / totSize
        if (quote.last > 0) {
          const dev = (microprice - quote.last) / quote.last * 10_000
          micropriceDev = Math.max(-1, Math.min(1, dev / 50)) // clip ±50bps → ±1
        }
      }
    }

    return {
      ema_stack: emaStack, rsi_mid: rsiMid, vwap_side: vwapSide,
      trend_strength: trendStrength, atr_norm: atrNorm,
      depth_imbalance: depthImbalance, microprice_dev: micropriceDev,
    }
  }

  scoreLocal(f: Features): number {
    let s = this.bias
    for (const k of FEATURE_KEYS) s += this.weights[k] * f[k]
    return Math.tanh(s)  // squash to [-1, +1]
  }

  decisionFromLocal(quote: Quote, ind: IndicatorSnapshot): { bias: 'bullish' | 'bearish' | 'neutral'; localScore: number; confidence: number } {
    const f = this.features(quote, ind)
    const s = this.scoreLocal(f)
    const bias = s > 0.18 ? 'bullish' : s < -0.18 ? 'bearish' : 'neutral'
    const confidence = Math.min(1, Math.abs(s) * 1.4)
    return { bias, localScore: s, confidence }
  }

  /**
   * SGD weight update from a realized trade outcome.
   * @param outcomePnl  realized P&L of the closed trade (USD)
   * @param notional    notional traded — used to normalize reward
   * @param features    snapshot at order entry
   * @param side        buy = +1, sell = -1
   */
  learn(outcomePnl: number, notional: number, features: Features, side: OrderSide): void {
    if (notional <= 0) return
    const reward = Math.max(-1, Math.min(1, outcomePnl / (notional * 0.02)))  // ±1 at 2% return
    const direction = side === 'buy' ? 1 : -1
    const target = reward * direction
    const predicted = this.scoreLocal(features)
    const error = target - predicted
    for (const k of FEATURE_KEYS) {
      this.weights[k] = clamp(this.weights[k] + LR * error * features[k], -1.5, 1.5)
      this.sampleSize[k] += 1
    }
    this.bias = clamp(this.bias + LR * error, -1.5, 1.5)
    this.biasSampleSize += 1
    this.persist()
    log.debug('brain learned', { error: error.toFixed(3), reward: reward.toFixed(3) })
  }

  private persist(): void {
    const now = Date.now()
    const params: BrainParameter[] = [
      ...FEATURE_KEYS.map<BrainParameter>(k => ({
        key: k, symbol: null, value: this.weights[k],
        sampleSize: this.sampleSize[k], confidence: confidenceOf(this.sampleSize[k]),
        updatedAt: now,
      })),
      { key: BIAS_KEY, symbol: null, value: this.bias, sampleSize: this.biasSampleSize, confidence: confidenceOf(this.biasSampleSize), updatedAt: now },
    ]
    for (const p of params) db.upsertBrainParam(p)
  }

  async decide(symbol: string, quote: Quote, ind: IndicatorSnapshot): Promise<AiDecision> {
    const local = this.decisionFromLocal(quote, ind)
    let llmRationale: string | null = null

    const llmCfg = getLlmConfig()
    if (llmCfg && local.confidence > 0.3) {
      try { llmRationale = await callAdvisor(llmCfg, symbol, quote, ind, local) }
      catch (e) { log.warn('llm advisor call failed', { err: String(e) }) }
    }

    return {
      symbol,
      bias: local.bias,
      confidence: local.confidence,
      localScore: local.localScore,
      llmRationale,
      veto: false,
      vetoReason: null,
      generatedAt: Date.now(),
    }
  }
}

function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, n)) }
function confidenceOf(samples: number): number { return Math.min(1, samples / 40) }

/** Build the advisory prompt and call the configured provider. The transport
 *  (timeout, auth, parsing, error caps) lives in services/llm.ts — audit §3.1's
 *  10s AbortSignal budget applies to every call, so a hung provider can no
 *  longer stall AutonomousTrader.runCycle. */
async function callAdvisor(
  cfg: LlmConfig,
  symbol: string,
  quote: Quote,
  ind: IndicatorSnapshot,
  local: { bias: 'bullish' | 'bearish' | 'neutral'; localScore: number; confidence: number },
): Promise<string> {
  return chatComplete(cfg, {
    system: 'You are an institutional trading advisor. Given indicator snapshot, return ONE sentence (max 35 words) on tactical bias for the symbol. No disclaimers. No advice. Just describe the technical state and qualify it. Use direct prose.',
    user: `Symbol: ${symbol}\nLast: ${quote.last.toFixed(2)}  VWAP: ${ind.vwap.toFixed(2)}  RSI14: ${ind.rsi14.toFixed(1)}  ATR14: ${ind.atr14.toFixed(2)}\nEMA9/21/50: ${ind.ema9.toFixed(2)} / ${ind.ema21.toFixed(2)} / ${ind.ema50.toFixed(2)}\nTrend strength: ${ind.trendStrength.toFixed(2)}\nLocal model bias: ${local.bias} (score ${local.localScore.toFixed(2)})`,
    maxTokens: 90,
    temperature: 0.4,
  })
}
