/**
 * SATEX — Self-Diagnostic Core: types (P-036).
 *
 * The vocabulary of the system's "understand the kink before the operator
 * notices" layer. A `HealthReport` is a *fused, graded* verdict over the raw
 * signals every service already emits (SystemStatus, FeedStatus, the broker
 * SessionState machine, telemetry, drawdown) — the thing `diagnoseHealth`
 * produces and a self-healing loop / the renderer health pill consumes.
 *
 * Pure data. No Electron, no engine, no order/risk imports — off the
 * trading-safety perimeter by construction (this layer classifies and
 * recommends; it never executes, sizes, or cancels anything).
 *
 * Grounding: the thresholds these types carry are the operator's own
 * Constitution §9.3 (Observability alert thresholds) and §11 (Failure Modes &
 * Recovery), encoded as code rather than prose. Each finding cites its section.
 */

/** Graded health, worst-wins when fused. Ordered: healthy < degraded < critical. */
export type HealthSeverity = 'healthy' | 'degraded' | 'critical'

/** Operating context. Live-broker findings (feed/WS/session) only apply to
 *  `paper` / `live`; `simulator` and `replay` have no broker WS to be "down". */
export type HealthMode = 'simulator' | 'paper' | 'live' | 'replay'

/** Broker session-machine state (mirror of `@shared/broker` SessionState).
 *  `null` when there is no broker session (simulator / replay). */
export type HealthSessionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'FAILED'
  | null

/** Stable code for each detectable kink. One per diagnostic rule. */
export type HealthFindingCode =
  | 'feed-stall'          // connected, but no ticks are landing (silent stall)
  | 'feed-disconnected'   // broker WS down for a measurable span
  | 'session-reconnecting'
  | 'session-failed'
  | 'memory-growth'       // heap trending up (leak)
  | 'error-rate'          // API/runtime error rate elevated
  | 'drawdown'            // rolling drawdown breaching the risk floor
  | 'last-error'          // engine surfaced a discrete error string

/**
 * A point-in-time snapshot of every signal the diagnostic reads. Modeled on the
 * real fields the engine already computes (`SystemStatus` in trading-engine.ts)
 * plus the drawdown / memory-trend / error-rate signals the wiring step will
 * supply. All time-derived values are passed IN so `diagnoseHealth` stays a
 * pure, deterministic function of its argument (no clock reads inside).
 */
export interface HealthSignals {
  /** Operating context — gates which findings are even considered. */
  mode: HealthMode
  /** Broker session state; `null` in simulator / replay. */
  sessionState: HealthSessionState
  /** Whether the engine considers its primary feed connected. */
  connected: boolean
  /** Rolling ticks/second over the status window. 0 ⇒ nothing is arriving. */
  tickHz: number
  /** Milliseconds since the last tick landed. */
  msSinceLastTick: number
  /** Continuous milliseconds the broker WS has been down (0 when up). */
  wsDownMs: number
  /** Heap in MB. Informational — the trend below is what is graded. */
  memMb: number
  /** Heap growth rate, percent per hour. `null` until a baseline exists. */
  memGrowthPctPerHr: number | null
  /** API/runtime error rate, percent of calls in the last minute. `null` if
   *  no calls were made in the window. */
  errorRatePct: number | null
  /** Rolling drawdown from session-start / high-water equity, as a positive
   *  fraction (0.03 = 3%). Never negative. */
  drawdownPct: number
  /** Most recent discrete error string surfaced by the engine, or `null`. */
  lastError: string | null
}

/** One identified kink: what broke, the proof, and the mandated response. */
export interface HealthFinding {
  code: HealthFindingCode
  /** Always 'degraded' or 'critical' for an emitted finding (never 'healthy'). */
  severity: Exclude<HealthSeverity, 'healthy'>
  /** One-line description of the kink. */
  summary: string
  /** The measured value vs the breached threshold (the evidence trail). */
  evidence: string
  /** The Constitution-mandated response — the self-heal action to take. */
  remediation: string
  /** Constitution section this rule encodes (e.g. '§9.3', '§11', '§5.2'). */
  ref: string
}

/** The fused verdict. `severity` is the worst finding; `findings` are ordered
 *  critical-first then by a fixed code order (deterministic). */
export interface HealthReport {
  severity: HealthSeverity
  findings: HealthFinding[]
  /** The single most urgent remediation (worst finding), or `null` when healthy. */
  recommendedAction: string | null
  /** Convenience for the renderer pill: `severity !== 'healthy'`. */
  needsAttention: boolean
}
