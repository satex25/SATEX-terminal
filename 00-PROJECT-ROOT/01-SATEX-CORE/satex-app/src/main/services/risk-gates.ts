/**
 * SATEX — Pre-Trade Risk Gates (Phase 10 · Black Box)
 *
 * Continuously evaluated guardrails against the current Account + Position[].
 * The renderer's RiskGatePanel reads this every push; ExecTicketPanel reads
 * `gatesForPreview` to overlay a "what if I send this order" snapshot.
 *
 * Six gates:
 *   1. DAILY_LOSS_LIMIT — account.dailyPnl vs account.dailyLossLimitPct * startingEquity
 *   2. POSITION_COUNT   — openPositions.length / config.maxPositions
 *   3. CONCENTRATION    — max(|notional|) / equity
 *   4. GROSS_LEVERAGE   — Σ|notional| / equity
 *   5. CORRELATION      — rolling avg pairwise corr across open symbols
 *   6. SESSION_VAR      — 95% session VaR vs target
 *
 * Each gate normalizes to `pct` in [0, 1] for the progress bar; status thresholds
 * are encoded per-gate and recoloured at WATCH (>=60%) and BREACH (>=90%).
 */
import type {
  Account, Position, OrderRequest, Quote, Candle,
  RiskGate, RiskGatesSnapshot, RiskGateStatus,
  PnlSnapshot,
} from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('risk')

export type RiskGatesListener = (snap: RiskGatesSnapshot) => void

export interface RiskGatesConfig {
  /** Max simultaneous open positions before POSITION_COUNT breaches. */
  maxPositions:        number
  /** Concentration WATCH threshold (fraction of equity in single name). */
  concentrationWatch:  number
  /** Concentration BREACH threshold. */
  concentrationBreach: number
  /** Gross leverage WATCH multiplier of equity. */
  grossLeverageWatch:  number
  /** Gross leverage BREACH multiplier of equity. */
  grossLeverageBreach: number
  /** Correlation WATCH threshold for avg pairwise rho. */
  correlationWatch:    number
  /** SESSION_VAR target in $ — the denominator for the SESSION_VAR pct. */
  sessionVarTarget:    number
}

const DEFAULTS: RiskGatesConfig = {
  maxPositions:        5,
  concentrationWatch:  0.30,
  concentrationBreach: 0.50,
  grossLeverageWatch:  2.0,
  grossLeverageBreach: 3.0,
  correlationWatch:    0.60,
  sessionVarTarget:    12_000,
}

interface RiskGatesDeps {
  getAccount:    () => Account
  getQuote:      (symbol: string) => Quote | undefined
  getCandles:    (symbol: string, limit?: number) => Candle[]
  /** Recent PnL snapshots for SESSION_VAR computation. */
  getPnlSnapshots: () => PnlSnapshot[]
  /** Session-start equity baseline. Sourced from OrderManager.getSessionStartEquity
   *  so the DAILY_LOSS_LIMIT gate is computed against the same value Gate 3
   *  enforces in OrderManager.validate (adversarial finding C2 rebases this
   *  to broker-reported equity on the first Alpaca sync). Pre-2026-05-18 this
   *  service used the imported DEFAULT_EQUITY constant, which silently
   *  diverged from OM enforcement by up to 10× once C2 rebased OM. */
  getSessionStartEquity: () => number
}

function statusForPct(pct: number, watch: number, breach: number): RiskGateStatus {
  if (pct >= breach) return 'BREACH'
  if (pct >= watch)  return 'WATCH'
  return 'OK'
}

/** Minimum overlapping bars required for a meaningful Pearson correlation.
 *  Below this we'd be reading noise as signal; the pair is skipped. */
const MIN_CORR_OVERLAP = 20

/** Pearson correlation of two equal-length close-price arrays. Caller is
 *  responsible for timestamp alignment — see alignCloses() below. Exported
 *  for unit tests of adversarial-finding C4. */
export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n < MIN_CORR_OVERLAP) return 0
  let sumA = 0, sumB = 0
  for (let i = 0; i < n; i++) { sumA += a[i]!; sumB += b[i]! }
  const ma = sumA / n, mb = sumB / n
  let num = 0, da = 0, db = 0
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma, xb = b[i]! - mb
    num += xa * xb; da += xa * xa; db += xb * xb
  }
  const denom = Math.sqrt(da * db)
  return denom === 0 ? 0 : num / denom
}

/** Align two candle series by `time` and return the matched close-price arrays.
 *  When series have different lengths (one symbol joined the portfolio later,
 *  feed gap, late subscribe) raw index-based correlation reads garbage from
 *  misaligned timestamps — produces a number that looks meaningful but compares
 *  bar T of A against bar T-k of B. This alignment drops unmatched bars.
 *  Exported for unit tests of adversarial-finding C4. */
export function alignCloses(a: Candle[], b: Candle[]): { a: number[]; b: number[] } {
  const bByTime = new Map<number, number>()
  for (const c of b) bByTime.set(c.time, c.close)
  const outA: number[] = []
  const outB: number[] = []
  for (const c of a) {
    const matched = bByTime.get(c.time)
    if (matched !== undefined) { outA.push(c.close); outB.push(matched) }
  }
  return { a: outA, b: outB }
}

/** Sample stdev of an array. */
function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)
  return Math.sqrt(v)
}

export class RiskGatesService {
  private deps: RiskGatesDeps
  private config: RiskGatesConfig = { ...DEFAULTS }
  private listeners: Set<RiskGatesListener> = new Set()
  private timer: NodeJS.Timeout | null = null
  private snapshot: RiskGatesSnapshot | null = null

  constructor(deps: RiskGatesDeps, config?: Partial<RiskGatesConfig>) {
    this.deps = deps
    if (config) this.config = { ...DEFAULTS, ...config }
  }

  start(intervalMs = 2000): void {
    if (this.timer) return
    this.recompute()
    this.timer = setInterval(() => this.recompute(), intervalMs)
    log.info('risk-gates service started', { intervalMs })
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  get(): RiskGatesSnapshot {
    if (!this.snapshot) this.recompute()
    return this.snapshot!
  }

  onUpdate(fn: RiskGatesListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Hypothetical "if I sent this order, what would the gates look like?".
   *  Doesn't mutate any service state — just runs the eval against a copied
   *  account with the order's notional added to a virtual position. */
  gatesForPreview(req: OrderRequest): RiskGatesSnapshot {
    const account = this.deps.getAccount()
    const lastPx = this.deps.getQuote(req.symbol)?.last ?? req.limitPrice ?? 0
    if (lastPx <= 0) return this.compute(account)
    const virtualPos: Position = {
      symbol:        req.symbol,
      quantity:      req.side === 'buy' ?  req.quantity : -req.quantity,
      avgPrice:      lastPx,
      unrealizedPnl: 0,
      realizedPnl:   0,
      openedAt:      Date.now(),
    }
    const hypothetical: Account = {
      ...account,
      openPositions: [...account.openPositions, virtualPos],
    }
    return this.compute(hypothetical)
  }

  private recompute(): void {
    const account = this.deps.getAccount()
    this.snapshot = this.compute(account)
    for (const fn of this.listeners) fn(this.snapshot)
  }

  private compute(account: Account): RiskGatesSnapshot {
    const positions = account.openPositions
    const equity = Math.max(1, account.equity)
    const cfg = this.config

    // Gate 1 — DAILY LOSS LIMIT
    // Baseline is sessionStartEquity (matches OrderManager Gate 3 enforcement
    // after the C2 broker-equity rebase). Guard against a non-positive baseline
    // (boot-time race before OM is initialized) by falling back to current
    // equity — keeps the panel readable instead of NaN/Infinity.
    const baseline = Math.max(1, this.deps.getSessionStartEquity())
    const dailyLossBudget = baseline * account.dailyLossLimitPct
    const dailyLossUsed = Math.max(0, -account.dailyPnl)
    const dailyLossPct = Math.min(1, dailyLossUsed / Math.max(1, dailyLossBudget))
    const dailyLossStatus = statusForPct(dailyLossPct, 0.7, 0.95)
    const dailyLossValue = `${(account.dailyPnl / baseline * 100).toFixed(1)}% / −${(account.dailyLossLimitPct * 100).toFixed(1)}% buf`

    // Gate 2 — POSITION COUNT
    const posPct = Math.min(1, positions.length / cfg.maxPositions)
    const posStatus = statusForPct(posPct, 0.6, 1.0)
    const posValue = `${positions.length} / ${cfg.maxPositions} max`

    // Gate 3 — CONCENTRATION
    let maxNotional = 0
    let maxSymbol = ''
    for (const p of positions) {
      const px = this.deps.getQuote(p.symbol)?.last ?? p.avgPrice
      const n = Math.abs(p.quantity * px)
      if (n > maxNotional) { maxNotional = n; maxSymbol = p.symbol }
    }
    const concPct = Math.min(1, maxNotional / equity / cfg.concentrationBreach)
    const concRaw = maxNotional / equity
    const concStatus = concRaw >= cfg.concentrationBreach ? 'BREACH'
                     : concRaw >= cfg.concentrationWatch  ? 'WATCH'
                     : 'OK'
    const concValue = maxNotional > 0
      ? `${(concRaw * 100).toFixed(0)}% ${maxSymbol} · cap ${(cfg.concentrationBreach * 100).toFixed(0)}%`
      : `— / cap ${(cfg.concentrationBreach * 100).toFixed(0)}%`

    // Gate 4 — GROSS LEVERAGE
    let grossNotional = 0
    for (const p of positions) {
      const px = this.deps.getQuote(p.symbol)?.last ?? p.avgPrice
      grossNotional += Math.abs(p.quantity * px)
    }
    const grossX = grossNotional / equity
    const grossPct = Math.min(1, grossX / cfg.grossLeverageBreach)
    const grossStatus = grossX >= cfg.grossLeverageBreach ? 'BREACH'
                      : grossX >= cfg.grossLeverageWatch  ? 'WATCH'
                      : 'OK'
    const grossValue = `${grossX.toFixed(2)}× / ${cfg.grossLeverageBreach.toFixed(1)}× max`

    // Gate 5 — CORRELATION (rolling avg pairwise rho across open symbols)
    let avgRho = 0
    let dominantPair: string | null = null
    let usablePairCount = 0
    let droppedPairCount = 0
    if (positions.length >= 2) {
      const candlesBySym: Record<string, Candle[]> = {}
      for (const p of positions) {
        const cs = this.deps.getCandles(p.symbol, 60)
        if (cs.length >= MIN_CORR_OVERLAP) candlesBySym[p.symbol] = cs
      }
      const syms = Object.keys(candlesBySym)
      let sumRho = 0
      let topRho = 0
      for (let i = 0; i < syms.length; i++) {
        for (let j = i + 1; j < syms.length; j++) {
          const aligned = alignCloses(candlesBySym[syms[i]!]!, candlesBySym[syms[j]!]!)
          if (aligned.a.length < MIN_CORR_OVERLAP) {
            droppedPairCount++
            continue
          }
          const rho = correlation(aligned.a, aligned.b)
          sumRho += Math.abs(rho)
          usablePairCount++
          if (Math.abs(rho) > Math.abs(topRho)) {
            topRho = rho
            dominantPair = `${syms[i]}/${syms[j]}`
          }
        }
      }
      avgRho = usablePairCount > 0 ? sumRho / usablePairCount : 0
    }
    const corrPct = Math.min(1, avgRho / 1.0)
    const corrStatus = statusForPct(corrPct, cfg.correlationWatch, 0.9)
    const corrValue = positions.length < 2
      ? 'n/a · need ≥2 positions'
      : usablePairCount === 0
        ? `n/a · need ≥${MIN_CORR_OVERLAP} aligned bars (dropped ${droppedPairCount})`
        : dominantPair
          ? `${avgRho.toFixed(2)} · ${dominantPair} tight`
          : `${avgRho.toFixed(2)} avg`

    // Gate 6 — SESSION VAR (95%)
    const snaps = this.deps.getPnlSnapshots()
    const MIN_SNAPS = 8
    let varDollar = 0
    const haveEnoughSnaps = snaps.length >= MIN_SNAPS
    if (haveEnoughSnaps) {
      const equities = snaps.map(s => s.equity)
      const returns: number[] = []
      for (let i = 1; i < equities.length; i++) {
        const e0 = equities[i - 1]!, e1 = equities[i]!
        if (e0 > 0) returns.push((e1 - e0) / e0)
      }
      // 95% one-sided VaR ≈ 1.645 stdev × current equity
      varDollar = 1.645 * stdev(returns) * equity
    }
    const varPct = Math.min(1, varDollar / cfg.sessionVarTarget)
    const varStatus = statusForPct(varPct, 0.7, 1.0)
    // 2026-05-18 — explicit "n/a" while warming up instead of "$0 / 12k tgt"
    // which read as "perfectly healthy" but was actually "no data yet". PnL
    // snapshots accumulate at 60s cadence; MIN_SNAPS=8 → ~8 minutes warmup.
    const varValue = haveEnoughSnaps
      ? `$${Math.round(varDollar).toLocaleString()} / ${(cfg.sessionVarTarget / 1000).toFixed(0)}k tgt`
      : `n/a · need ≥${MIN_SNAPS} snapshots (${snaps.length})`

    const gates: RiskGate[] = [
      { key: 'DAILY_LOSS_LIMIT', label: 'DAILY LOSS LIMIT',  pct: dailyLossPct,  status: dailyLossStatus, value: dailyLossValue },
      { key: 'POSITION_COUNT',   label: 'POSITION COUNT',    pct: posPct,        status: posStatus,       value: posValue },
      { key: 'CONCENTRATION',    label: 'CONCENTRATION',     pct: concPct,       status: concStatus,      value: concValue },
      { key: 'GROSS_LEVERAGE',   label: 'GROSS LEVERAGE',    pct: grossPct,      status: grossStatus,     value: grossValue },
      { key: 'CORRELATION',      label: 'CORRELATION ρ̄',    pct: corrPct,       status: corrStatus,      value: corrValue },
      { key: 'SESSION_VAR',      label: 'SESSION VAR (95%)', pct: varPct,        status: varStatus,       value: varValue },
    ]

    let okCount = 0, watchCount = 0, breachCount = 0
    for (const g of gates) {
      if (g.status === 'OK') okCount++
      else if (g.status === 'WATCH') watchCount++
      else breachCount++
    }

    return {
      gates,
      passingCount:   okCount,
      watchingCount:  watchCount,
      breachingCount: breachCount,
      computedAt:     Date.now(),
    }
  }
}
