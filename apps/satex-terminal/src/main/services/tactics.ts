/**
 * SATEX — MAY-TACTICS Engine.
 *
 * Session-history learner with three states:
 *   - calibrating: not yet graduated; gate is pass-through.
 *   - armed:       user has graduated; gate is active and vetoes weak entries.
 *   - veto:        recent performance below floor → block all entries. The
 *                  drawdown veto is a RUNNING-MAX LATCH: `metrics().maxDrawdown`
 *                  is the max over the whole retained history, so once a breach
 *                  enters the buffer the veto clears only when the trough-defining
 *                  trades age out of the 500-trade FIFO (or history resets) — NOT
 *                  via subsequent recovery trades. It is reconstructed from
 *                  persisted history at boot, so it also persists across restarts.
 *                  Deliberately conservative: the gate is a restriction, so a
 *                  latched veto fails safe (it only ever blocks entries). See
 *                  P-131 — accepted as intentional; windowed-drawdown recovery
 *                  stays a future option only if evidence shows the latch is too
 *                  aggressive. The stickiness is regression-pinned in tactics.test.ts.
 *
 * Graduation is a user-confirmed checkpoint (never auto-promoted). It becomes
 * AVAILABLE only once the closed-trade record clears the armed gate's own floors
 * over an adequate sample: n ≥ MIN_TRADES_FOR_ARMED, expectancy > 0, and
 * win-rate ≥ MIN_WIN_RATE. `armed` then gates on the persisted `graduated` flag
 * ALONE — raising the sample floor never disarms an already-graduated gate.
 *
 * The gate is consulted by the order manager BEFORE each entry order (buys).
 * Exits (sells) are never blocked — flat-out is always allowed.
 *
 * Tactics are computed from realized P&L of CLOSED trades only — no leakage
 * from unrealized.
 */
import type { TacticsStatus } from '@shared/types'
import { createLogger } from './logger'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const log = createLogger('tactics')

const MIN_TRADES_FOR_ARMED = 30     // closed-trade floor before graduation is available
const MIN_WIN_RATE         = 0.45
const MIN_EXPECTANCY       = 0.0
const MAX_DRAWDOWN_VETO    = 0.06   // 6% drawdown → veto
const SIGNAL_QUALITY_FLOOR = 0.55   // armed gate only allows trades whose signal confidence ≥ this

/**
 * Store schema version. Bumped when the on-disk `history` shape or its
 * trustworthiness changes. v1 (2026-07-20) resets any pre-version file because
 * the retired `seedFromOrders` path persisted fabricated `pnl:0` rows that are
 * indistinguishable from legitimate break-even closes — a surgical strip is
 * impossible, so a one-time reset is the only clean migration. `graduated` is
 * preserved across the reset so an already-armed gate is never silently disarmed.
 */
const STORE_VERSION = 1

interface Stored {
  version: number
  history: Array<{ pnl: number; ts: number; symbol: string }>
  /** Requires explicit user graduation before tactics gate activates. */
  graduated: boolean
}

const FILE = () => path.join(app.getPath('userData'), 'tactics.json')

function load(): Stored {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Stored>
    if ((parsed.version ?? 0) < STORE_VERSION) {
      // Pre-version file: history may hold seeded pnl:0 poison → reset it once,
      // keep the graduation flag, and re-persist at the current version.
      const migrated: Stored = { version: STORE_VERSION, history: [], graduated: !!parsed.graduated }
      save(migrated)
      return migrated
    }
    return { version: STORE_VERSION, history: parsed.history ?? [], graduated: !!parsed.graduated }
  } catch { return { version: STORE_VERSION, history: [], graduated: false } }
}
function save(s: Stored): void {
  try { fs.writeFileSync(FILE(), JSON.stringify(s), 'utf8') }
  catch (e) { log.warn('save failed', { err: String(e) }) }
}

export class TacticsEngine {
  private store: Stored = load()
  private vetoActive = false
  private vetoReason: string | null = null

  constructor() {
    // Reconstruct the drawdown veto from persisted history at boot. `vetoActive`
    // is NOT persisted, so without this a session that ended in a drawdown breach
    // would boot with the veto cleared and pass entries until the next close.
    this.refresh()
  }

  /** Record an outcome — call ONCE per closed trade (full position flat). */
  recordOutcome(symbol: string, realizedPnl: number): void {
    this.store.history.push({ pnl: realizedPnl, ts: Date.now(), symbol })
    if (this.store.history.length > 500) this.store.history.shift()
    save(this.store)
    this.refresh()
  }

  status(): TacticsStatus {
    const m = this.metrics()
    // Armed state gates on the `graduated` flag ALONE — never on the live trade
    // count. Raising MIN_TRADES_FOR_ARMED must not disarm a legacy graduate.
    const state: TacticsStatus['state'] = this.vetoActive
      ? 'veto'
      : this.store.graduated
        ? 'armed'
        : 'calibrating'
    return {
      state,
      tradesObserved: m.trades,
      tradesRequired: MIN_TRADES_FOR_ARMED,
      winRate: m.winRate,
      expectancy: m.expectancy,
      maxDrawdown: m.maxDrawdown,
      signalQuality: SIGNAL_QUALITY_FLOOR,
      graduationEligible: this.isGraduationEligible(m),
      vetoActive: this.vetoActive,
      vetoReason: this.vetoReason,
      lastUpdated: Date.now(),
    }
  }

  /**
   * The graduation bar: an adequate, actually-profitable closed-trade record.
   * `graduate()` and the UI both read this ONE predicate so they never diverge.
   * n=30 is stricter than the retired count-of-8 but not strong evidence — a
   * zero-edge strategy clears it a meaningful fraction of the time; the human
   * click and the paper-only policy are the backstops.
   */
  private isGraduationEligible(m: ReturnType<TacticsEngine['metrics']>): boolean {
    return m.trades >= MIN_TRADES_FOR_ARMED && m.expectancy > 0 && m.winRate >= MIN_WIN_RATE
  }

  /**
   * Pre-trade gate. Returns ok=true to allow, ok=false to veto with a reason.
   * Only called on entry orders (buys / opening shorts), never exits.
   */
  preTradeGate(signalConfidence: number): { ok: true } | { ok: false; reason: string } {
    const m = this.metrics()
    if (!this.store.graduated) return { ok: true }  // not graduated — pass-through
    if (this.vetoActive) return { ok: false, reason: this.vetoReason ?? 'tactics veto' }
    // Win-rate floor only bites once the sample is statistically adequate.
    if (m.winRate < MIN_WIN_RATE && m.trades >= MIN_TRADES_FOR_ARMED) {
      return { ok: false, reason: `Win rate ${(m.winRate * 100).toFixed(0)}% below floor ${(MIN_WIN_RATE * 100).toFixed(0)}%` }
    }
    if (m.expectancy < MIN_EXPECTANCY) {
      return { ok: false, reason: `Negative expectancy (${m.expectancy.toFixed(2)})` }
    }
    if (signalConfidence < SIGNAL_QUALITY_FLOOR) {
      return { ok: false, reason: `Signal confidence ${(signalConfidence * 100).toFixed(0)}% below ${(SIGNAL_QUALITY_FLOOR * 100).toFixed(0)}% floor` }
    }
    return { ok: true }
  }

  /**
   * Graduate from calibrating → armed.
   * REQUIRES explicit user confirmation via UI — never auto-promoted.
   * Per locked invariant: "MAY-TACTICS leaving calibrating mode" is a user checkpoint.
   */
  graduate(): { ok: boolean; reason?: string } {
    const m = this.metrics()
    // Same three clauses as isGraduationEligible, checked individually so the
    // refusal names the unmet one. The record must already clear the armed
    // gate's own floors (win-rate, expectancy) over an adequate sample.
    if (m.trades < MIN_TRADES_FOR_ARMED) return { ok: false, reason: `Need ${MIN_TRADES_FOR_ARMED} closed trades (have ${m.trades})` }
    if (m.expectancy <= 0) return { ok: false, reason: `Expectancy must be positive (is ${m.expectancy.toFixed(2)})` }
    if (m.winRate < MIN_WIN_RATE) return { ok: false, reason: `Win rate ${(m.winRate * 100).toFixed(0)}% below ${(MIN_WIN_RATE * 100).toFixed(0)}% floor` }
    this.store.graduated = true
    save(this.store)
    log.warn('TACTICS GRADUATED — pre-trade gate now active', m)
    return { ok: true }
  }

  private refresh(): void {
    const m = this.metrics()
    if (m.maxDrawdown > MAX_DRAWDOWN_VETO) {
      this.vetoActive = true
      this.vetoReason = `Drawdown ${(m.maxDrawdown * 100).toFixed(1)}% exceeds veto floor`
    } else if (this.vetoActive && m.maxDrawdown < MAX_DRAWDOWN_VETO * 0.5) {
      this.vetoActive = false
      this.vetoReason = null
      log.info('tactics veto lifted', m)
    }
  }

  private metrics(): { trades: number; winRate: number; expectancy: number; maxDrawdown: number } {
    const h = this.store.history
    if (h.length === 0) return { trades: 0, winRate: 0, expectancy: 0, maxDrawdown: 0 }
    const wins = h.filter(t => t.pnl > 0).length
    const winRate = wins / h.length
    const expectancy = h.reduce((a, t) => a + t.pnl, 0) / h.length
    let peak = 0, equity = 0, maxDd = 0
    for (const t of h) {
      equity += t.pnl
      peak = Math.max(peak, equity)
      maxDd = Math.max(maxDd, (peak - equity) / Math.max(1, peak || 1000))
    }
    return { trades: h.length, winRate, expectancy, maxDrawdown: maxDd }
  }
}
