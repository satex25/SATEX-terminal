/**
 * SATEX — Nightly Backtest Self-Evaluation (2026-06-10, audit §6.3.5).
 *
 * The "training loop without self-modification risk": once a night the system
 * re-runs its own strategies (BrainStrategy with the LIVE learned weights,
 * plus the Tier-2 ensemble candidates) over the most recent completed session
 * of real bars, compares the result against a locked baseline via
 * `compareReports`, and writes a verdict the operator can read in the vault.
 *
 * STRICTLY OBSERVATIONAL — this service:
 *   - never submits, sizes, or gates an order;
 *   - never mutates brain / pattern / tactics state (Brain weights are READ);
 *   - never touches risk parameters.
 * Its only outputs are markdown + JSON baselines in `Vault/Backtests/` and
 * structured log lines (which surface in the SystemLogs panel).
 *
 * Baseline policy (mirrors the regression framework's contract): the first
 * run for a (strategy, symbol) pair WRITES the baseline; subsequent runs
 * compare against it and report violations. Intentional strategy
 * improvements are promoted by deleting the stale baseline file — the next
 * nightly run re-locks it.
 *
 * All effects are injected (candles, clock, file IO) so the scheduling and
 * report logic are fully unit-testable without Electron, Alpaca, or a disk.
 */
import type { Candle } from '@shared/types'
import type { BacktestReport, SignificanceMetrics } from '@shared/backtest/types'
import { barReturns } from '@shared/backtest/metrics'
import { compareReports, DEFAULT_TOLERANCES } from '@shared/backtest/regression'
import { significanceFromReturns, withDsr } from '@shared/backtest/significance'
import type { Strategy } from '../backtest/strategy'
import { BacktestRunner } from '../backtest/runner'
import { SpreadHalfPlusImpactModel } from '../backtest/slippage-model'
import { createLogger } from './logger'

const log = createLogger('self-eval')

/** Bars below this are too thin to say anything — symbol is skipped. */
const MIN_BARS = 120
const STARTING_EQUITY = 100_000
const NOTIONAL_PCT = 0.05

export interface SelfEvalDeps {
  /** Symbols to evaluate (typically the autonomous watchlist). */
  getWatchlist: () => string[]
  /** Most recent completed session of bars for a symbol (1Min typical).
   *  Return [] when unavailable (no creds, market holiday) — symbol skipped. */
  getCandles: (symbol: string) => Promise<Candle[]>
  /** Strategy roster to evaluate. Rebuilt per run so BrainStrategy sees the
   *  latest learned weights. */
  buildStrategies: () => Strategy[]
  /** Read a locked baseline; null when none exists yet. */
  readBaseline: (key: string) => BacktestReport | null
  /** Lock a new baseline. */
  writeBaseline: (key: string, report: BacktestReport) => void
  /** Persist the nightly markdown report; receives a filename + body. */
  writeReport: (filename: string, markdown: string) => void
  now?: () => number
}

export interface SelfEvalRunResult {
  startedAt: number
  finishedAt: number
  evaluated: number
  skipped: number
  baselined: number
  regressions: Array<{ key: string; violations: string[] }>
  reportFilename: string
}

/** ms from `now` until the next occurrence of HH:MM local time. Exported for
 *  unit tests. Always returns a strictly positive delay (rolls to tomorrow
 *  when the time already passed today). */
export function msUntilNext(hour: number, minute: number, now: Date): number {
  const next = new Date(now)
  next.setHours(hour, minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}

function fmtPct(x: number): string { return `${(x * 100).toFixed(1)}%` }

/** Render the nightly verdict as vault-ready markdown. Exported for tests. */
export function renderReportMd(args: {
  ts: number
  rows: Array<{
    key: string
    report: BacktestReport
    status: 'baselined' | 'ok' | 'regression'
    violations: string[]
    sig: SignificanceMetrics
  }>
  skipped: Array<{ symbol: string; reason: string }>
}): string {
  const d = new Date(args.ts)
  const lines: string[] = []
  lines.push('---')
  lines.push('type: self-eval')
  lines.push(`date: ${d.toISOString()}`)
  lines.push('tags: [satex, backtest, self-eval]')
  lines.push('---')
  lines.push('')
  lines.push(`# Nightly Self-Evaluation — ${d.toISOString().slice(0, 10)}`)
  lines.push('')
  lines.push('Strategies re-run over the latest completed session with live learned')
  lines.push('weights; regression-checked against locked baselines. Observational only.')
  lines.push('')
  lines.push('| Strategy · Symbol | Trades | Hit | Sharpe | PSR | DSR | Signif. | MaxDD | PnL | Verdict |')
  lines.push('|---|---:|---:|---:|---:|---:|---|---:|---:|---|')
  for (const r of args.rows) {
    const m = r.report.metrics
    const verdict = r.status === 'baselined' ? '🆕 baseline locked'
                  : r.status === 'ok'         ? '✅ within tolerance'
                  : `🔴 ${r.violations.join('; ')}`
    const pnl = r.report.endingEquity - r.report.startingEquity
    const { psr, dsr } = r.sig
    const signif = dsr != null && dsr >= 0.95 ? '✅ real'
                 : psr != null && psr >= 0.95 ? '⚠️ selection-risk'
                 : '🔬 noise-band'
    const psrCell = psr == null ? 'n/a' : fmtPct(psr)
    const dsrCell = dsr == null ? 'n/a' : fmtPct(dsr)
    lines.push(`| ${r.key} | ${m.tradeCount} | ${fmtPct(m.hitRate)} | ${m.sharpe.toFixed(2)} | ${psrCell} | ${dsrCell} | ${signif} | ${fmtPct(m.maxDrawdown)} | $${pnl.toFixed(0)} | ${verdict} |`)
  }
  if (args.rows.length === 0) lines.push('| _no runs — insufficient data_ | | | | | | | | | |')
  lines.push('')
  if (args.skipped.length > 0) {
    lines.push('## Skipped')
    lines.push('')
    for (const s of args.skipped) lines.push(`- ${s.symbol} — ${s.reason}`)
    lines.push('')
  }
  lines.push(`> Signif. uses PSR (vs SR*=0) and DSR deflated across N=${args.rows.length} trials this run.`)
  lines.push('')
  lines.push('> Promote an intentional improvement by deleting its stale baseline in')
  lines.push('> `Vault/Backtests/baselines/` — the next nightly run re-locks it.')
  lines.push('')
  return lines.join('\n')
}

export class SelfEvalService {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private lastResult: SelfEvalRunResult | null = null

  constructor(
    private readonly deps: SelfEvalDeps,
    private readonly schedule: { hour: number; minute: number } = { hour: 2, minute: 30 },
  ) {}

  /** Arm the nightly timer. Idempotent. */
  start(): void {
    if (this.timer) return
    this.armNext()
    log.info('self-eval scheduled', { hour: this.schedule.hour, minute: this.schedule.minute })
  }

  stop(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
  }

  isScheduled(): boolean { return this.timer !== null }
  isRunning(): boolean { return this.running }
  getLastResult(): SelfEvalRunResult | null { return this.lastResult }

  private armNext(): void {
    const delay = msUntilNext(this.schedule.hour, this.schedule.minute, new Date(this.deps.now?.() ?? Date.now()))
    this.timer = setTimeout(() => {
      void this.runOnce()
        .catch(e => log.error('self-eval run failed', { err: String(e) }))
        .finally(() => this.armNext())
    }, delay)
    // Don't hold the process open just for the nightly timer.
    this.timer.unref?.()
  }

  /** One full evaluation pass. Public so an operator (or a test) can trigger
   *  it on demand without waiting for the schedule. Re-entrant-safe. */
  async runOnce(): Promise<SelfEvalRunResult | null> {
    if (this.running) { log.warn('self-eval already running — skipped'); return null }
    this.running = true
    const startedAt = this.deps.now?.() ?? Date.now()
    try {
      const rows: Array<{ key: string; report: BacktestReport; status: 'baselined' | 'ok' | 'regression'; violations: string[]; sig: SignificanceMetrics }> = []
      const skipped: Array<{ symbol: string; reason: string }> = []
      let baselined = 0
      const regressions: Array<{ key: string; violations: string[] }> = []

      for (const symbol of this.deps.getWatchlist()) {
        let candles: Candle[] = []
        try { candles = await this.deps.getCandles(symbol) }
        catch (e) { skipped.push({ symbol, reason: `bars unavailable: ${String(e)}` }); continue }
        if (candles.length < MIN_BARS) {
          skipped.push({ symbol, reason: `only ${candles.length} bars (< ${MIN_BARS})` })
          continue
        }

        for (const strategy of this.deps.buildStrategies()) {
          const key = `${strategy.name} · ${symbol}`
          const runner = new BacktestRunner(strategy, new SpreadHalfPlusImpactModel({ impactCoef: 0.0001 }), {
            strategy: strategy.name,
            symbol,
            tape: `self-eval-${new Date(startedAt).toISOString().slice(0, 10)}`,
            startingEquity: STARTING_EQUITY,
            slippageModel: 'spread-half-impact',
            notionalPct: NOTIONAL_PCT,
          })
          const report = runner.run({ candles, assetClass: 'equity', periodsPerYear: 252 * 6.5 * 60 })
          // P-096: single-series significance (PSR/minTRL) from the run's own
          // returns; DSR needs the whole trial set — deflated after the loops.
          const sig = significanceFromReturns(barReturns(report.equityCurve))

          const baseline = this.deps.readBaseline(key)
          if (!baseline) {
            this.deps.writeBaseline(key, report)
            baselined++
            rows.push({ key, report, status: 'baselined', violations: [], sig })
          } else {
            const cmp = compareReports(baseline, report, DEFAULT_TOLERANCES)
            if (cmp.ok) {
              rows.push({ key, report, status: 'ok', violations: [], sig })
            } else {
              rows.push({ key, report, status: 'regression', violations: cmp.violations, sig })
              regressions.push({ key, violations: cmp.violations })
            }
          }
        }
      }

      // P-096: trial-aware second pass — deflate each row's Sharpe against the
      // expected max-Sharpe under the null for THIS run's trial set (N = rows).
      const trialSRs = rows.map(r => r.sig.perObsSharpe).filter((x): x is number => x != null && Number.isFinite(x))
      rows.forEach(r => { r.sig = withDsr(r.sig, trialSRs) })

      const finishedAt = this.deps.now?.() ?? Date.now()
      const stamp = new Date(startedAt)
      const reportFilename = `${stamp.getFullYear()}${String(stamp.getMonth() + 1).padStart(2, '0')}${String(stamp.getDate()).padStart(2, '0')}-${String(stamp.getHours()).padStart(2, '0')}${String(stamp.getMinutes()).padStart(2, '0')}${String(stamp.getSeconds()).padStart(2, '0')}-self-eval.md`
      this.deps.writeReport(reportFilename, renderReportMd({ ts: startedAt, rows, skipped }))

      const result: SelfEvalRunResult = {
        startedAt, finishedAt,
        evaluated: rows.length,
        skipped: skipped.length,
        baselined,
        regressions,
        reportFilename,
      }
      this.lastResult = result
      if (regressions.length > 0) {
        log.warn('self-eval REGRESSIONS detected', { count: regressions.length, keys: regressions.map(r => r.key) })
      } else {
        log.info('self-eval complete', { evaluated: rows.length, skipped: skipped.length, baselined })
      }
      return result
    } finally {
      this.running = false
    }
  }
}
