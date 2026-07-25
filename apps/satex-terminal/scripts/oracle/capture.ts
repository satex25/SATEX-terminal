/**
 * SATEX-RS oracle — the golden-capture driver.
 *
 * RS-UP-1 / RS-1.3 slice 3, and the substantive half of the task the plan
 * calls its sleeper. Boots the real `TradingEngine` with no Electron runtime,
 * replays one corpus session on a virtual clock, subscribes to the public
 * decision stream, and emits the golden records defined in Appendix A.3.
 *
 * Zero engine edits
 * -----------------
 * The seam was measured, not built: `new TradingEngine()` takes no arguments,
 * `initialize()` reads its world through `env.ts` and `electron`, and every
 * observation this driver needs is already exposed as a public `onX` listener
 * (`trading-engine.ts:899-1044`). The harness supplies a different world — the
 * sandbox, the stub, the pinned environment, the closed network — and the
 * engine runs unmodified. Nothing in `src/main` knows the oracle exists.
 *
 * Why a virtual clock rather than a fixed `Clock` injection
 * --------------------------------------------------------
 * RS-0.6 found the TS replay path is not decision-deterministic as it stands:
 * decisions are timer-driven and the replay cursor is wall-anchored —
 * `ReplaySource.currentReplayTime()` is literally
 * `anchorReplayTs + (Date.now() - anchorWallTs) * speed`. RS-0.7's remedy was
 * driver-level fake timers, and that is what `VirtualClock` is. Under it,
 * `Date.now()` advances only when this driver says so, which makes the cursor
 * a pure function of how far the driver has stepped. The engine keeps calling
 * `Date.now()` exactly as it always has.
 *
 * Why ids are normalized instead of seeding `Math.random`
 * ------------------------------------------------------
 * `shortId()` mixes `Date.now()` and `Math.random()` into every order and
 * session id, and its counter is process-wide, so two captures in one process
 * produce different raw ids by construction. Seeding the global RNG would hide
 * that — and would hide the *next* stray nondeterministic call too. Normalizing
 * ids in the golden (slice 1's `IdNormalizer`) leaves the double-run hash as a
 * live tripwire for everything else. This is the operator's normalize-in-golden
 * ruling (ledger P-143).
 *
 * The decision stream is not deterministic yet — P-155
 * -----------------------------------------------------
 * `autonomy` defaults to **off**, so a default capture carries no
 * `autonomy.decision` records. That is not a scoping preference; it is a defect
 * this driver found.
 *
 * `getAiDecision` (`trading-engine.ts:1538`) passes `this.depth.get(symbol)`
 * into `brain.decide()`. `DepthFeedService.jitterFor` churns that ladder with
 * four unseeded `Math.random()` calls per tick (`depth-feed.ts:87-91`), and the
 * brain turns the top of it into `depth_imbalance` (weight 0.15) and
 * `microprice_dev` (0.10) (`brain.ts:86-105`) — so roughly a quarter of every
 * confidence score is drawn from an unseeded RNG. Two runs measured: identical
 * symbol, tick index and virtual timestamp, confidence 0.3520162749933342 vs
 * 0.36683881944775815.
 *
 * Note the shape of the mistake this corrects, because it generalises: an
 * earlier draft called depth "not captured, therefore out of Oracle L1/L2
 * scope". Excluding a source from the captured *stream* does not remove it from
 * the *computation*. Appendix A.2 wants such sites seamed or excluded by
 * explicit ruling — here the answer is seam, and until it lands the defect is
 * pinned by a deliberately-failing-when-fixed test in
 * `capture.determinism.test.ts`.
 *
 * Caller contract
 * ---------------
 * Each capture needs a fresh module registry (`vi.resetModules()`), because
 * `persistence.ts` caches its database handle in a module-level singleton and
 * `id-generator.ts` keeps a process-wide counter. The engine is imported
 * dynamically here so that reset actually takes effect.
 */
import type { Account, Order, RiskGatesSnapshot, AutonomousDecision, FeedStatus, ClosedTrade, ReplayStatus, BrainParameter } from '@shared/types'
import { GoldenStream, type JsonValue, type OracleLevel } from './golden'
import { importCorpusTape, type ImportResult } from './importer'
import { blockNetwork, pinEnv, type OracleSandbox } from './sandbox'
import { sandboxDbPath, type StubJournal } from './electron-stub'
import type { CorpusTape } from './corpus'

/**
 * The clock the capture drives. Backed by vitest's fake timers in practice
 * (which are `@sinonjs/fake-timers`), kept as an interface so the driver never
 * imports a test framework.
 */
export interface VirtualClock {
  /** Current virtual wall-clock reading, epoch ms. */
  now(): number
  /** Advance virtual time by `ms`, running every timer and microtask due. */
  advance(ms: number): Promise<void>
}

/** Defaults that are part of the golden contract — changing one changes bytes. */
export const CAPTURE_DEFAULTS = {
  /** Replay speed multiplier. 10× keeps a nine-minute tape to ~55 s of virtual
   *  wall time while still draining only ~160 ms of tape per 16 ms replay tick,
   *  so decisions stay finely spaced. */
  speed: 10,
  /** Virtual ms per advance step. One second per step fires ~60 replay ticks. */
  stepMs: 1_000,
  /** Emit an L2 state checkpoint every N replay-status pushes. Status is
   *  broadcast at 2 Hz of virtual wall time, so 4 is a checkpoint every two
   *  virtual seconds — dense enough that a drift is localized to a short span
   *  of tape, sparse enough that a nine-minute session stays a small file. */
  checkpointEvery: 4,
} as const

/** Arguments for one capture. */
export interface CaptureOptions {
  sandbox: OracleSandbox
  clock: VirtualClock
  tape: CorpusTape
  /** Replay speed. Defaults to {@link CAPTURE_DEFAULTS}. */
  speed?: number
  /** Virtual ms per advance step. Defaults to {@link CAPTURE_DEFAULTS}. */
  stepMs?: number
  /** Ceiling on virtual ms before the run is declared stalled. Defaults to
   *  four times the tape duration divided by speed, which is generous. */
  budgetMs?: number
  /** Journal from the electron stub the caller registered with `vi.mock`.
   *  Folded into the summary so a capture can attest that no dialog was
   *  answered during the run. */
  journal?: StubJournal
  /**
   * Run the autonomous trader during the capture, populating the
   * `autonomy.decision` stream. Off by default.
   *
   * Safe by three independent walls, none of which this harness supplies:
   * `AutonomousTrader` refuses to submit when live capital is routed, the
   * sandbox has no broker credentials so nothing could be routed anyway, and
   * `submitOrder` refuses outright during replay. What survives is the part
   * worth capturing — the *decisions*, which is what Appendix A.3 L1 is about.
   */
  autonomy?: boolean
}

/** Everything a capture can attest to about itself. */
export interface CaptureSummary {
  readonly sessionId: string
  /** SHA-256 of the golden bytes — the value the double-run proof compares. */
  readonly goldenHash: string
  readonly records: number
  /** Tape rows the replay source actually emitted. */
  readonly emittedTicks: number
  /** `end-of-tape` on a healthy run; `budget-exhausted` on a stall. */
  readonly replayEndReason: string | null
  readonly virtualMsElapsed: number
  /** Outbound requests refused during the run. */
  readonly networkAttempts: readonly string[]
  /** Dialog messages raised. Non-empty means something sought authorization. */
  readonly dialogs: readonly string[]
  readonly import: ImportResult
}

export interface CaptureResult {
  readonly stream: GoldenStream
  readonly summary: CaptureSummary
}

/**
 * Converts an engine object to a golden-safe JSON value.
 *
 * Keys whose value is `undefined` are dropped, matching both `JSON.stringify`
 * and serde's `skip_serializing_if = "Option::is_none"` — an absent optional is
 * absent on both sides of the parity comparison. Non-finite numbers are
 * deliberately left alone so `canonicalize()` throws on them: a NaN reaching
 * the golden writer is a caught engine bug, not a formatting question.
 */
export function toJsonValue(input: unknown): JsonValue {
  if (input === null) return null
  const t = typeof input
  if (t === 'number' || t === 'string' || t === 'boolean') return input as JsonValue
  if (Array.isArray(input)) return input.map(toJsonValue)
  if (t === 'object') {
    const out: { [k: string]: JsonValue } = {}
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (v === undefined) continue
      out[k] = toJsonValue(v)
    }
    return out
  }
  // Functions, symbols, bigint: nothing in the captured payloads produces
  // these, so reaching here means the shape changed under us.
  throw new Error(`oracle capture: value of type ${t} cannot be represented in a golden record`)
}

/**
 * Boots the engine over one tape and returns its golden stream.
 *
 * The caller owns the sandbox, the electron mock, and the module reset; this
 * function owns the environment pin, the network block, the import, the engine
 * lifecycle, and the stream.
 */
export async function captureGolden(opts: CaptureOptions): Promise<CaptureResult> {
  const { sandbox, clock, tape } = opts
  const speed = opts.speed ?? CAPTURE_DEFAULTS.speed
  const stepMs = opts.stepMs ?? CAPTURE_DEFAULTS.stepMs
  const tapeDurationMs = tape.header.lastTs - tape.header.firstTs
  const budgetMs = opts.budgetMs ?? Math.max(60_000, Math.ceil((tapeDurationMs / speed) * 4))

  const env = pinEnv()
  const net = blockNetwork()
  const stream = new GoldenStream()

  // Dynamic so `vi.resetModules()` in the caller actually produces a fresh
  // engine and a fresh database singleton.
  const db = await import('../../src/main/services/persistence')
  const { TradingEngine } = await import('../../src/main/core/trading-engine')

  const startedAtVirtual = clock.now()
  let emittedTicks = 0
  let replayEndReason: string | null = null
  let statusPushes = 0

  /** Appends one record at the current tape position and clock reading. */
  const emit = (level: OracleLevel, kind: string, payload: unknown): void => {
    stream.emit({ tickIndex: emittedTicks, ts: clock.now(), level, kind, payload: toJsonValue(payload) })
  }

  let importResult: ImportResult
  let engine: InstanceType<typeof TradingEngine> | null = null
  try {
    importResult = importCorpusTape(tape, db, { dbFile: sandboxDbPath(sandbox) })

    engine = new TradingEngine()
    await engine.initialize()

    // ── Oracle L1 — decisions ────────────────────────────────────────────────
    // Every gate verdict, order intent, autonomous decision, simulated close,
    // and data-source verdict. Appendix A.3: equality here is exact, no
    // tolerance exists.
    engine.onRiskGatesUpdate((s: RiskGatesSnapshot) => emit('L1', 'gates.verdict', s))
    engine.onOrders((orders: Order[]) => emit('L1', 'order.book', orders))
    engine.onAutonomousDecision((d: AutonomousDecision) => emit('L1', 'autonomy.decision', d))
    engine.onTradeClosed((t: ClosedTrade) => emit('L1', 'trade.closed', t))
    engine.onFeedStatus((s: FeedStatus) => emit('L1', 'feed.status', s))

    // ── Oracle L2 — state checkpoints ────────────────────────────────────────
    // A.3 asks for state "checkpointed every N ticks + at every L1 event", so
    // both halves are wired. This listener is the event-driven half: the
    // engine broadcasts an account only when something moved it (a fill, a
    // kill-switch flip). On a replay that routes no orders it never fires,
    // which is why the pulled half below is not optional.
    engine.onAccount((a: Account) => emit('L2', 'account.checkpoint', a))

    /** Pulls the L2 state vector at the current tape position. */
    const emitStateCheckpoint = (): void => {
      emit('L2', 'account.checkpoint', engine!.om.getAccount())
      emit('L2', 'brain.checkpoint', db.listBrainParams() as BrainParameter[])
      emit('L2', 'calibration.checkpoint', engine!.getCalibration())
      // Session state machine (A.3 L2). Carries the engine's own generated
      // session id, which differs between two runs by construction — the
      // golden holds it as a normalized placeholder, so this record is what
      // keeps the `IdNormalizer` load-bearing in the double-run proof.
      emit('L2', 'session.checkpoint', db.listSessions(10))
    }

    // Replay status drives the tape cursor every record is indexed by, and
    // paces the periodic checkpoint. It is not itself a golden record: it
    // reports harness progress, not an engine decision.
    engine.onReplayStatus((s: ReplayStatus) => {
      emittedTicks = s.emittedTicks
      if (s.autoPausedReason !== null) replayEndReason = s.autoPausedReason
      statusPushes += 1
      if (statusPushes % CAPTURE_DEFAULTS.checkpointEvery === 0) emitStateCheckpoint()
    })

    const started = await engine.startReplay({ sessionId: tape.header.sessionId, speed })
    if (!started.ok) {
      throw new Error(`oracle capture: replay refused to start — ${started.reason ?? 'no reason given'}`)
    }
    // The engine's own view of what it is replaying, not an echo of the input:
    // `sessionId` here is read back out of `ReplaySource`. It is a generated id,
    // so the golden carries it as a normalized placeholder — which session a
    // golden belongs to is recorded in the run manifest, not in the stream.
    const openStatus = engine.getReplayStatus()
    emit('L1', 'replay.start', {
      ok: started.ok,
      sessionId: openStatus.sessionId,
      speed: openStatus.speed,
      tapeStartTs: openStatus.tapeStartTs,
      tapeEndTs: openStatus.tapeEndTs,
    })
    emitStateCheckpoint()

    if (opts.autonomy === true) {
      const enabled = engine.enableAutonomous()
      emit('L1', 'autonomy.enabled', enabled)
    }

    // ── Drive the clock ──────────────────────────────────────────────────────
    // `ReplaySource` auto-pauses with `end-of-tape` once the cursor reaches the
    // last row; that, not a row count, is the termination signal. The budget is
    // a stall detector: a capture that quietly stops advancing must fail
    // loudly rather than emit a short golden that looks complete.
    let virtualMsElapsed = 0
    while (replayEndReason === null && virtualMsElapsed < budgetMs) {
      await clock.advance(stepMs)
      virtualMsElapsed += stepMs
    }
    if (replayEndReason === null) replayEndReason = 'budget-exhausted'

    // Final state vector, so a golden always ends with a comparable checkpoint
    // whatever the tape did in between.
    emitStateCheckpoint()
    const finalStatus = engine.getReplayStatus()
    emit('L1', 'replay.end', {
      reason: replayEndReason,
      emittedTicks: finalStatus.emittedTicks,
      progress: finalStatus.progress,
      cursorTs: finalStatus.cursorTs,
    })

    return {
      stream,
      summary: {
        sessionId: tape.header.sessionId,
        goldenHash: stream.hash(),
        records: stream.length,
        emittedTicks: finalStatus.emittedTicks,
        replayEndReason,
        virtualMsElapsed: clock.now() - startedAtVirtual,
        networkAttempts: [...net.attempts],
        // Empty is the healthy answer: nothing asked for human authorization
        // during the run, so nothing could have armed live mode.
        dialogs: [...(opts.journal?.dialogs ?? [])],
        import: importResult,
      },
    }
  } finally {
    // Teardown order matters: stop the engine (which stops replay, seals
    // sub-second buckets, and closes the database) before the environment and
    // network are restored, so nothing that runs during shutdown can reach the
    // real world or read the operator's environment.
    if (engine) {
      try { await engine.shutdown() }
      catch { /* a shutdown fault must not mask the capture's own result */ }
    }
    net.restore()
    env.restore()
  }
}
