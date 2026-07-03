/**
 * SATEX — Sub-second emit-rate telemetry (A1 Sprint 3, v0.5).
 *
 * Counts every sealed bucket per (symbol, bucketMs) and logs the per-minute
 * rate at INFO so operators can spot pathological symbols in production logs.
 * Driven by the aggregator's optional `onTelemetryEmit` callback — every
 * sealBucket() fires recordEmit() on this service.
 *
 * Design doc §6 Sprint 3 task 3: "log the sub-second emit rate at INFO once
 * per minute so we can spot pathological symbols in production logs."
 *
 * Why a logger and not an IPC push: this is operator observability for log
 * scraping, not a renderer-facing metric. The renderer already gets every
 * sealed bar via SUBSECOND_CANDLES_UPDATE; adding a parallel telemetry push
 * would compete for the same channel budget without adding signal.
 *
 * Pure logic — no Electron deps. The logger is the only side effect.
 */
import { createLogger } from './logger'

const log = createLogger('subsecond-telemetry')

export interface TelemetryDeps {
  /** Window length in milliseconds between flushes. Defaults to 60_000 per
   *  A1 design §6 Sprint 3. */
  intervalMs?: number
  /** Logger override — production uses the module-scope `log`; tests inject a
   *  spy. Optional so production doesn't have to pass anything. */
  logger?: {
    info:  (msg: string, data?: Record<string, unknown>) => void
    debug: (msg: string, data?: Record<string, unknown>) => void
  }
}

const DEFAULT_INTERVAL_MS = 60_000

export interface FlushResult {
  rates:        ReadonlyArray<{ symbol: string; bucketMs: number; count: number }>
  totalEmits:   number
  windowStart:  number
  windowEnd:    number
}

export class SubsecondTelemetry {
  private readonly intervalMs: number
  private readonly logger: NonNullable<TelemetryDeps['logger']>
  private counters = new Map<string, number>()
  private windowStart = Date.now()
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(deps: TelemetryDeps = {}) {
    this.intervalMs = deps.intervalMs ?? DEFAULT_INTERVAL_MS
    this.logger     = deps.logger     ?? { info: log.info, debug: log.debug }
  }

  /** Increment the per-(symbol, bucketMs) counter. Called by the aggregator
   *  via the `onTelemetryEmit` dep on every successful seal. Hot-path
   *  function — keep allocation-free in the common case. */
  recordEmit(symbol: string, bucketMs: number): void {
    const key = `${symbol}:${bucketMs}`
    this.counters.set(key, (this.counters.get(key) ?? 0) + 1)
  }

  /** Schedule periodic `flushAndLog()`. Idempotent — second start is a no-op. */
  start(): void {
    if (this.timer) return
    this.windowStart = Date.now()
    this.timer = setInterval(() => {
      try { this.flushAndLog() }
      catch (e) {
        // Defensive — Map iteration / Date.now / log calls shouldn't throw,
        // but if anything does, never let the timer thread die.
        log.error('telemetry flush threw', { err: String(e) })
      }
    }, this.intervalMs)
  }

  /** Stop the scheduled timer. In-flight counters are NOT flushed — they
   *  ride into the next session's first window (which is harmless: the
   *  counters reset on construction, and stop() is only called at shutdown
   *  by which point operators don't need a final emit-rate). Idempotent. */
  stop(): void {
    if (!this.timer) return
    clearInterval(this.timer)
    this.timer = null
  }

  /** Snapshot the counters, reset them, log if non-empty, and return the
   *  flushed window. Returns even when empty so tests can assert the empty
   *  case explicitly. */
  flushAndLog(): FlushResult {
    const windowEnd = Date.now()
    const rates: Array<{ symbol: string; bucketMs: number; count: number }> = []
    let totalEmits = 0
    for (const [key, count] of this.counters) {
      const sepAt = key.lastIndexOf(':')
      const symbol   = key.slice(0, sepAt)
      const bucketMs = Number(key.slice(sepAt + 1))
      rates.push({ symbol, bucketMs, count })
      totalEmits += count
    }
    // Deterministic order for log readability + test assertions.
    rates.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.bucketMs - b.bucketMs)
    const result: FlushResult = {
      rates, totalEmits,
      windowStart: this.windowStart,
      windowEnd,
    }
    if (totalEmits > 0) {
      this.logger.info('emit-rate', {
        windowMs:    windowEnd - this.windowStart,
        totalEmits,
        rates,
      })
    }
    // Reset for next window.
    this.counters.clear()
    this.windowStart = windowEnd
    return result
  }

  /** Test-only — is the periodic timer currently scheduled? */
  _isRunning(): boolean { return this.timer !== null }
}
