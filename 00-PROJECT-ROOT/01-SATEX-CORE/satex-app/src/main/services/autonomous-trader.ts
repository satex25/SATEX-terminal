/**
 * SATEX — Autonomous Paper Trader.
 *
 * Continuous trading scheduler for paper-only operation. The "trade while you
 * sleep" surface. Every cycle:
 *   1. For each watchlist symbol, skip if a position is already open or the
 *      symbol is in cooldown.
 *   2. Ask Brain.decide() for a bias + confidence.
 *   3. If confidence ≥ threshold and bias is directional, build an OrderRequest
 *      sized at notionalPct of equity, with ATR-based bracket stops, and
 *      submit through engine.submitOrder (which runs the 9-gate validator).
 *   4. On each submission outcome, push an AutonomousDecision to listeners.
 *
 * Safety: this trader REFUSES to submit when the Alpaca endpoint mode is 'live'
 * or the live-mode typed-phrase interlock is armed. Autonomous decisions never
 * route to real capital — the user must drive that flip manually with both
 * walls passed.
 */
import type {
  Account, AiDecision, AutonomousDecision, AutonomousStatus,
  IndicatorSnapshot, OrderRequest, Quote, StrategySignal,
} from '@shared/types'
import { createLogger } from './logger'
import { AUTONOMOUS_DEFAULTS, DEFAULT_STOP_VOLATILITY_MULT, DEFAULT_TAKE_PROFIT_VOLATILITY_MULT } from '@shared/constants'
import { shortId } from './id-generator'

const log = createLogger('autonomous')

export interface AutonomousConfig {
  /** Cycle period in ms. 30s is the default — fast enough to catch breakouts,
   *  slow enough that we don't churn on every tick. */
  intervalMs: number
  /** Local-brain confidence required to consider entering. Floor = the
   *  tactics SIGNAL_QUALITY_FLOOR; raising it above 0.6 makes the trader more
   *  selective. */
  confidenceThreshold: number
  /** Notional size per trade as a fraction of equity. */
  notionalPct: number
  /** Hard floor / ceiling on per-trade notional (USD). Floor protects against
   *  drawdown shrinking the account into useless-tiny-orders. */
  minNotional: number
  maxNotional: number
  /** Per-symbol cooldown after any decision (success or veto). Prevents the
   *  trader from re-entering the same symbol within seconds. */
  cooldownMs: number
  /** ATR multiples for bracket stop / take-profit. */
  stopAtrMult: number
  takeProfitAtrMult: number
}

const DEFAULT_AUTONOMOUS_CONFIG: AutonomousConfig = {
  intervalMs: 30_000,
  confidenceThreshold: AUTONOMOUS_DEFAULTS.confidenceThreshold,
  notionalPct: AUTONOMOUS_DEFAULTS.maxPositionSizePct,
  minNotional: 1_500,
  maxNotional: 5_000,
  cooldownMs: 5 * 60_000,
  stopAtrMult: DEFAULT_STOP_VOLATILITY_MULT,
  takeProfitAtrMult: DEFAULT_TAKE_PROFIT_VOLATILITY_MULT,
}

export interface AutonomousDeps {
  getWatchlist: () => string[]
  getQuote:     (symbol: string) => Quote | undefined
  getIndicators:(symbol: string) => IndicatorSnapshot
  getAccount:   () => Account
  /** True when ANY non-paper safety wall is engaged — autonomous refuses. */
  isLiveCapitalRouted: () => boolean
  getDecision:  (symbol: string) => Promise<AiDecision>
  submitOrder:  (req: OrderRequest, opts?: { signalConfidence?: number }) => Promise<{ ok: boolean; orderId?: string; reason?: string }>
  /** Tier-2 follow-up — optional ensemble-driven signal. When present,
   *  takes precedence over getDecision. Returning null = strategy
   *  abstains; the trader records it as a rejected decision (same UX
   *  shape as a below-threshold AiDecision). The signal''s stopLossHint
   *  / takeProfitHint are used verbatim — the trader does NOT re-derive
   *  ATR-based brackets in this path. */
  getSignal?:   (symbol: string) => Promise<StrategySignal | null>
}

type DecisionListener = (d: AutonomousDecision) => void
type StatusListener   = (s: AutonomousStatus) => void

export class AutonomousTrader {
  private deps: AutonomousDeps
  private config: AutonomousConfig = { ...DEFAULT_AUTONOMOUS_CONFIG }
  private timer: NodeJS.Timeout | null = null
  private cycling = false
  private cooldowns = new Map<string, number>()
  private decisionListeners = new Set<DecisionListener>()
  private statusListeners   = new Set<StatusListener>()
  private status: AutonomousStatus = {
    enabled: false,
    lastDecisionAt: null,
    approvedCount: 0,
    rejectedCount: 0,
    cooldownsActive: 0,
    signalsFired: 0,
  }
  /** Bounded ring buffer of recent decisions for the UI. */
  private recent: AutonomousDecision[] = []
  private static RECENT_CAP = 50

  constructor(deps: AutonomousDeps) { this.deps = deps }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  start(): { ok: boolean; reason?: string } {
    if (this.status.enabled) return { ok: true }
    this.status = { ...this.status, enabled: true }
    this.scheduleNext()
    log.warn('autonomous trader enabled', { interval: this.config.intervalMs, threshold: this.config.confidenceThreshold })
    this.broadcastStatus()
    return { ok: true }
  }

  stop(): { ok: boolean } {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    this.status = { ...this.status, enabled: false }
    log.warn('autonomous trader disabled')
    this.broadcastStatus()
    return { ok: true }
  }

  getStatus():   AutonomousStatus      { return { ...this.status, cooldownsActive: this.activeCooldownCount() } }
  getConfig():   AutonomousConfig      { return { ...this.config } }
  getRecent():   AutonomousDecision[]  { return [...this.recent] }
  setConfig(patch: Partial<AutonomousConfig>): AutonomousConfig {
    this.config = { ...this.config, ...patch }
    log.info('autonomous config updated', patch)
    return { ...this.config }
  }

  onDecision(fn: DecisionListener): () => void { this.decisionListeners.add(fn); return () => this.decisionListeners.delete(fn) }
  onStatus(fn: StatusListener):     () => void { this.statusListeners.add(fn);   return () => this.statusListeners.delete(fn) }

  // ── Cycle ──────────────────────────────────────────────────────────────────
  private scheduleNext(): void {
    if (!this.status.enabled) return
    this.timer = setTimeout(() => { void this.runCycle() }, this.config.intervalMs)
  }

  private async runCycle(): Promise<void> {
    if (this.cycling) { this.scheduleNext(); return }
    if (!this.status.enabled) return
    this.cycling = true
    try {
      // Safety wall: never let autonomous touch live capital. This trader is
      // a paper-only construct by policy (Phase C, 2026-05-13).
      if (this.deps.isLiveCapitalRouted()) {
        log.warn('autonomous cycle skipped — live capital routed; manual control only')
        this.status.lastDecisionAt = Date.now()
        return
      }
      const account = this.deps.getAccount()
      if (account.killSwitchArmed) {
        log.debug('autonomous cycle skipped — kill switch armed')
        return
      }
      const watchlist = this.deps.getWatchlist()
      for (const symbol of watchlist) {
        try { await this.tryOne(symbol, account) }
        catch (e) { log.warn('autonomous tryOne failed', { symbol, err: String(e) }) }
      }
      this.status.lastDecisionAt = Date.now()
      this.broadcastStatus()
    } finally {
      this.cycling = false
      this.scheduleNext()
    }
  }

  private async tryOne(symbol: string, account: Account): Promise<void> {
    // Cooldown — symbol-level rate limit
    const cdUntil = this.cooldowns.get(symbol) ?? 0
    if (cdUntil > Date.now()) return

    // Skip if already holding the symbol
    if (account.openPositions.some(p => p.symbol === symbol && p.quantity !== 0)) return

    const quote = this.deps.getQuote(symbol)
    if (!quote || quote.last <= 0) return
    const ind = this.deps.getIndicators(symbol)
    if (!ind || ind.atr14 <= 0) return  // need ATR to size bracket stops

    // Tier-2 ensemble path takes precedence when wired in. The legacy
    // getDecision path stays as the fallback so older callers (and the
    // existing test suite) keep working unchanged.
    //
    //   New path: deps.getSignal returns a StrategySignal with explicit
    //             stop-loss / take-profit / side. The trader uses them
    //             verbatim — no ATR re-derivation.
    //   Old path: deps.getDecision returns an AiDecision (bias +
    //             confidence). The trader builds ATR-based brackets and
    //             maps bias → side.
    let plannedSide: 'buy' | 'sell'
    let plannedStop: number
    let plannedTp:   number
    let plannedConfidence: number
    let plannedSetup:      string

    if (this.deps.getSignal) {
      let sig: StrategySignal | null
      try { sig = await this.deps.getSignal(symbol) }
      catch (e) { log.debug('getSignal failed', { symbol, err: String(e) }); return }
      this.status.signalsFired++
      if (!sig) {
        this.recordDecision({
          id: shortId('ad'), symbol, approved: false,
          reason: 'strategy abstained',
          confidence: 0, size: 0, riskReward: 0, createdAt: Date.now(),
        })
        this.cooldowns.set(symbol, Date.now() + this.config.cooldownMs)
        return
      }
      if (sig.confidence < this.config.confidenceThreshold) {
        this.recordDecision({
          id: shortId('ad'), symbol, approved: false,
          reason: `${sig.setup} · confidence ${(sig.confidence * 100).toFixed(0)}% < ${(this.config.confidenceThreshold * 100).toFixed(0)}%`,
          confidence: sig.confidence, size: 0, riskReward: 0, createdAt: Date.now(),
        })
        this.cooldowns.set(symbol, Date.now() + this.config.cooldownMs)
        return
      }
      plannedSide       = sig.action
      plannedStop       = round2(sig.stopLossHint)
      plannedTp         = round2(sig.takeProfitHint)
      plannedConfidence = sig.confidence
      plannedSetup      = sig.setup
    } else {
      let decision: AiDecision
      try { decision = await this.deps.getDecision(symbol) }
      catch (e) { log.debug('decide failed', { symbol, err: String(e) }); return }
      this.status.signalsFired++
      if (decision.bias === 'neutral' || decision.confidence < this.config.confidenceThreshold) {
        this.recordDecision({
          id: shortId('ad'), symbol, approved: false,
          reason: `${decision.bias} · confidence ${(decision.confidence * 100).toFixed(0)}% < ${(this.config.confidenceThreshold * 100).toFixed(0)}%`,
          confidence: decision.confidence, size: 0, riskReward: 0, createdAt: Date.now(),
        })
        this.cooldowns.set(symbol, Date.now() + this.config.cooldownMs)
        return
      }
      plannedSide       = decision.bias === 'bullish' ? 'buy' : 'sell'
      plannedConfidence = decision.confidence
      plannedSetup      = 'autonomous'
      // ATR-based bracket stops, side-aware. Long: stop BELOW / TP ABOVE.
      const atrStop   = ind.atr14 * this.config.stopAtrMult
      const atrTarget = ind.atr14 * this.config.takeProfitAtrMult
      plannedStop = plannedSide === 'buy'
        ? round2(quote.last - atrStop)
        : round2(quote.last + atrStop)
      plannedTp = plannedSide === 'buy'
        ? round2(quote.last + atrTarget)
        : round2(quote.last - atrTarget)
    }

    // Common build + submit + record path.
    const targetNotional = Math.max(
      this.config.minNotional,
      Math.min(this.config.maxNotional, account.equity * this.config.notionalPct),
    )
    const qty = Math.max(1, Math.floor(targetNotional / quote.last))
    const notional = qty * quote.last

    const riskDist   = Math.abs(quote.last - plannedStop)
    const rewardDist = Math.abs(plannedTp - quote.last)
    const riskReward = rewardDist / Math.max(0.01, riskDist)

    const req: OrderRequest = {
      symbol, side: plannedSide, type: 'market', quantity: qty,
      stopLoss: plannedStop, takeProfit: plannedTp,
      source: plannedSetup === 'autonomous' ? 'autonomous' : `autonomous-${plannedSetup}`,
    }
    const result = await this.deps.submitOrder(req, { signalConfidence: plannedConfidence })
    if (result.ok) {
      this.status.approvedCount++
      this.recordDecision({
        id: shortId('ad'), symbol, approved: true,
        reason: `${plannedSetup} · confidence ${(plannedConfidence * 100).toFixed(0)}% · ${qty} sh · RR ${riskReward.toFixed(1)}`,
        confidence: plannedConfidence, size: notional, riskReward, createdAt: Date.now(),
      })
      log.info('autonomous entry submitted', { symbol, setup: plannedSetup, qty, notional, riskReward: riskReward.toFixed(2) })
    } else {
      this.status.rejectedCount++
      this.recordDecision({
        id: shortId('ad'), symbol, approved: false,
        reason: result.reason ?? 'submission rejected',
        confidence: plannedConfidence, size: notional, riskReward, createdAt: Date.now(),
      })
      log.debug('autonomous entry rejected', { symbol, reason: result.reason })
    }
    this.cooldowns.set(symbol, Date.now() + this.config.cooldownMs)
  }

  private recordDecision(d: AutonomousDecision): void {
    this.recent.push(d)
    if (this.recent.length > AutonomousTrader.RECENT_CAP) this.recent.shift()
    for (const fn of this.decisionListeners) {
      try { fn(d) } catch (e) { log.warn('decision listener threw', { err: String(e) }) }
    }
  }

  private activeCooldownCount(): number {
    const now = Date.now()
    let n = 0
    for (const t of this.cooldowns.values()) if (t > now) n++
    return n
  }

  private broadcastStatus(): void {
    const s = this.getStatus()
    for (const fn of this.statusListeners) {
      try { fn(s) } catch (e) { log.warn('status listener threw', { err: String(e) }) }
    }
  }
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
