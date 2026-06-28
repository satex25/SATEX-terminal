/**
 * SATEX — Self-Diagnostic Core: `diagnoseHealth` (P-036).
 *
 * Pure, deterministic fusion of the raw health signals into a graded verdict.
 * This is the layer that lets the terminal *understand a kink before the
 * operator notices it*: it encodes the operator's own Constitution §9.3
 * (Observability alert thresholds) and §11 (Failure Modes & Recovery) — today
 * prose — as executable, test-pinned classification, and emits, for each kink,
 * the Constitution-mandated remediation a self-healing loop can act on.
 *
 * INVARIANTS (load-bearing):
 *   • Pure function of its argument — no clock reads, no I/O, no randomness.
 *     Every time-derived signal is passed IN, so output is fully reproducible.
 *   • OFF the trading-safety perimeter — classifies and *recommends* only.
 *     Imports nothing from the engine / OrderManager / risk-gates. It cannot
 *     place, cancel, or size an order; the remediation strings are advice for
 *     the operator / a (separately sign-off-gated) auto-heal loop, never an
 *     execution.
 *   • Mode-aware so it never cries wolf (§0.7 calibrated confidence): feed / WS
 *     / session findings apply only to a live broker (`paper` / `live`);
 *     `simulator` and `replay` have no broker WS to be "down".
 *   • Deterministic ordering: severity desc, then a fixed code order.
 */
import type {
  HealthFinding,
  HealthFindingCode,
  HealthReport,
  HealthSeverity,
  HealthSignals,
} from './types'

/**
 * Diagnostic thresholds, each traced to its Constitution section. Exported so
 * the test pins them and the (future) wiring step shares one source of truth.
 */
export const HEALTH_THRESHOLDS = {
  /** §3.2.3 stale-data + §9.3: a CONNECTED live feed with no ticks for this
   *  long is a *silent* stall — the deceptive kind, because `connected` still
   *  reads true while the tape is frozen. */
  feedStallDegradedMs: 5_000,
  feedStallCriticalMs: 30_000,
  /** §9.3 "WebSocket disconnect duration > 10s → alert". */
  wsDownDegradedMs: 10_000,
  /** §11 "if > 5 min → HALT, alert". */
  wsDownCriticalMs: 300_000,
  /** §9.3 "Heap growth > 10%/hr → alert + restart worker". */
  memGrowthDegradedPctPerHr: 10,
  /** Escalation beyond the §9.3 alert floor — a runaway leak. */
  memGrowthCriticalPctPerHr: 25,
  /** §9.3 "Error rate > 5% in 1min window → alert". */
  errorRateDegradedPct: 5,
  /** Escalation — sustained high error rate ⇒ degraded mode / REST fallback. */
  errorRateCriticalPct: 20,
  /** §5.3 "drawdown > 3% → halt all trading, full review"; §11 "> 3% daily". */
  drawdownDegraded: 0.03,
  /** §5.2 "max drawdown (rolling) 5%"; §8.1 kill switch "> 5%". */
  drawdownCritical: 0.05,
} as const

const SEVERITY_RANK: Record<HealthSeverity, number> = {
  healthy: 0,
  degraded: 1,
  critical: 2,
}

/** Fixed display / tie-break order — most operationally urgent first. */
const CODE_ORDER: HealthFindingCode[] = [
  'session-failed',
  'feed-disconnected',
  'feed-stall',
  'session-reconnecting',
  'drawdown',
  'error-rate',
  'memory-growth',
  'last-error',
]

type Graded = Exclude<HealthSeverity, 'healthy'>

/**
 * Fuse the raw signals into a graded health report. See module header for the
 * invariants this upholds.
 */
export function diagnoseHealth(s: HealthSignals): HealthReport {
  const t = HEALTH_THRESHOLDS
  const findings: HealthFinding[] = []
  const isLiveBroker = s.mode === 'paper' || s.mode === 'live'
  const hasEquity = s.mode !== 'replay'

  // ── Connection / feed (live broker only — sim/replay have no broker WS) ──
  if (isLiveBroker) {
    // Session machine first: a FAILED / RECONNECTING session is the root cause
    // that a feed stall would otherwise merely be a symptom of.
    if (s.sessionState === 'FAILED') {
      findings.push({
        code: 'session-failed',
        severity: 'critical',
        summary: 'Broker session FAILED — order routing and market data are both down.',
        evidence: 'sessionState = FAILED',
        remediation:
          'HALT: freeze new entries, reconcile open orders via AccountSyncer, require operator review before restart.',
        ref: '§11, §8.1',
      })
    } else if (s.sessionState === 'RECONNECTING') {
      findings.push({
        code: 'session-reconnecting',
        severity: 'degraded',
        summary: 'Broker session is reconnecting — auto-retry in progress.',
        evidence: 'sessionState = RECONNECTING',
        remediation:
          'Hold new entries until CONNECTED; exponential-backoff reconnect (max 5 retries) is already running.',
        ref: '§2, §11',
      })
    }

    // WS down for a measurable span (explicit disconnect duration) takes
    // precedence over a silent stall — they are mutually exclusive.
    if (s.wsDownMs >= t.wsDownCriticalMs) {
      findings.push(
        feedDisconnected(
          'critical',
          s.wsDownMs,
          t.wsDownCriticalMs,
          'HALT trading — do NOT fall back to stale data; alert operator (§11 graceful degradation).',
          '§11',
        ),
      )
    } else if (s.wsDownMs >= t.wsDownDegradedMs) {
      findings.push(
        feedDisconnected(
          'degraded',
          s.wsDownMs,
          t.wsDownDegradedMs,
          'Alert: reconnect in progress; treat affected symbols as not-live until restored.',
          '§9.3',
        ),
      )
    } else if (s.connected && s.tickHz === 0) {
      // Silent stall: connected reads true but nothing is arriving — graded by
      // how long the tape has been frozen.
      if (s.msSinceLastTick >= t.feedStallCriticalMs) {
        findings.push(
          feedStall(
            'critical',
            s.msSinceLastTick,
            t.feedStallCriticalMs,
            'HALT trading — connected but tape frozen; never trade on stale data (§3.2.3 stale = poison).',
            '§11, §3.2.3',
          ),
        )
      } else if (s.msSinceLastTick >= t.feedStallDegradedMs) {
        findings.push(
          feedStall(
            'degraded',
            s.msSinceLastTick,
            t.feedStallDegradedMs,
            'Investigate: connected but no ticks; verify subscription + heartbeat before relying on quotes.',
            '§9.3, §3.2.3',
          ),
        )
      }
    }
  }

  // ── Memory (process-level — all modes) ──
  if (s.memGrowthPctPerHr !== null) {
    if (s.memGrowthPctPerHr >= t.memGrowthCriticalPctPerHr) {
      findings.push(memGrowth('critical', s.memGrowthPctPerHr, t.memGrowthCriticalPctPerHr, s.memMb))
    } else if (s.memGrowthPctPerHr >= t.memGrowthDegradedPctPerHr) {
      findings.push(memGrowth('degraded', s.memGrowthPctPerHr, t.memGrowthDegradedPctPerHr, s.memMb))
    }
  }

  // ── Error rate (all modes) ──
  if (s.errorRatePct !== null) {
    if (s.errorRatePct >= t.errorRateCriticalPct) {
      findings.push(errorRate('critical', s.errorRatePct, t.errorRateCriticalPct))
    } else if (s.errorRatePct >= t.errorRateDegradedPct) {
      findings.push(errorRate('degraded', s.errorRatePct, t.errorRateDegradedPct))
    }
  }

  // ── Drawdown (anything with equity — not replay) ──
  if (hasEquity) {
    if (s.drawdownPct >= t.drawdownCritical) {
      findings.push({
        code: 'drawdown',
        severity: 'critical',
        summary: 'Rolling drawdown breached the 5% kill-switch floor.',
        evidence: `drawdown ${pct(s.drawdownPct)} ≥ ${pct(t.drawdownCritical)}`,
        remediation: 'Kill-switch: full system halt, flatten per policy, operator review before restart.',
        ref: '§5.2, §8.1',
      })
    } else if (s.drawdownPct >= t.drawdownDegraded) {
      findings.push({
        code: 'drawdown',
        severity: 'degraded',
        summary: 'Rolling drawdown crossed the 3% daily-review threshold.',
        evidence: `drawdown ${pct(s.drawdownPct)} ≥ ${pct(t.drawdownDegraded)}`,
        remediation: 'Halt new trades for the day; full risk review (§5.3 circuit breaker).',
        ref: '§5.3, §11',
      })
    }
  }

  // ── Discrete engine error (all modes) ──
  if (s.lastError !== null && s.lastError.length > 0) {
    findings.push({
      code: 'last-error',
      severity: 'degraded',
      summary: 'Engine surfaced a discrete error.',
      evidence: `lastError: ${s.lastError}`,
      remediation: 'Inspect the structured log for the trace_id; confirm it is not a recurring fault.',
      ref: '§9.3',
    })
  }

  // Deterministic ordering: severity desc, then fixed code order.
  findings.sort((a, b) => {
    const bySev = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]
    if (bySev !== 0) return bySev
    return CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code)
  })

  const severity: HealthSeverity = findings.some((f) => f.severity === 'critical')
    ? 'critical'
    : findings.length > 0
      ? 'degraded'
      : 'healthy'

  return {
    severity,
    findings,
    recommendedAction: findings.length > 0 ? findings[0]!.remediation : null,
    needsAttention: severity !== 'healthy',
  }
}

// ── Finding factories (private — consistent evidence formatting) ────────────

function feedDisconnected(
  severity: Graded,
  ms: number,
  thresholdMs: number,
  remediation: string,
  ref: string,
): HealthFinding {
  return {
    code: 'feed-disconnected',
    severity,
    summary: 'Broker WebSocket is down.',
    evidence: `wsDownMs ${ms} ≥ ${thresholdMs}`,
    remediation,
    ref,
  }
}

function feedStall(
  severity: Graded,
  ms: number,
  thresholdMs: number,
  remediation: string,
  ref: string,
): HealthFinding {
  return {
    code: 'feed-stall',
    severity,
    summary: 'Feed reads connected but no ticks are arriving (silent stall).',
    evidence: `msSinceLastTick ${ms} ≥ ${thresholdMs}, tickHz 0`,
    remediation,
    ref,
  }
}

function memGrowth(severity: Graded, pctPerHr: number, threshold: number, memMb: number): HealthFinding {
  return {
    code: 'memory-growth',
    severity,
    summary: 'Heap is trending up — possible leak.',
    evidence: `memGrowth ${pctPerHr.toFixed(1)}%/hr ≥ ${threshold}%/hr (heap ${memMb}MB)`,
    remediation:
      severity === 'critical'
        ? 'Restart the worker process; capture a heap snapshot (recurring ⇒ code review).'
        : 'Alert + schedule a worker restart; watch for continued growth.',
    ref: '§9.3',
  }
}

function errorRate(severity: Graded, pctVal: number, threshold: number): HealthFinding {
  return {
    code: 'error-rate',
    severity,
    summary: 'API / runtime error rate is elevated.',
    evidence: `errorRate ${pctVal.toFixed(1)}% ≥ ${threshold}% (1-min window)`,
    remediation:
      severity === 'critical'
        ? 'Switch to degraded mode / REST polling; run an API health check (§11 rate-limit path).'
        : 'Alert + review routing; queue and back off requests on 429s.',
    ref: '§9.3, §11',
  }
}

/** Format a fraction as a whole-or-2dp percent string (0.03 → "3%"). */
function pct(fraction: number): string {
  const p = fraction * 100
  return Number.isInteger(p) ? `${p}%` : `${p.toFixed(2)}%`
}
