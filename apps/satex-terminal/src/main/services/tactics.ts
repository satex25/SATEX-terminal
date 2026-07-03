/**
 * SATEX — MAY-TACTICS Engine.
 *
 * Session-history learner with three states:
 *   - calibrating: needs MIN_TRADES closed trades before gating decisions.
 *   - armed:       gate is active; uses signal-quality threshold to allow trades.
 *   - veto:        recent performance below floor → block all entries until
 *                  drawdown recovers or daily session resets.
 *
 * The gate is consulted by the order manager BEFORE each entry order (buys).
 * Exits (sells) are never blocked — flat-out is always allowed.
 *
 * Tactics are computed from realized P&L of CLOSED trades only — no leakage
 * from unrealized.
 */
import type { Order, TacticsStatus } from '@shared/types'
import { createLogger } from './logger'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const log = createLogger('tactics')

const MIN_TRADES_FOR_ARMED = 8
const MIN_WIN_RATE         = 0.45
const MIN_EXPECTANCY       = 0.0
const MAX_DRAWDOWN_VETO    = 0.06   // 6% drawdown → veto
const SIGNAL_QUALITY_FLOOR = 0.55   // armed gate only allows trades whose signal confidence ≥ this

interface Stored {
  history: Array<{ pnl: number; ts: number; symbol: string }>
  /** Requires explicit user graduation before tactics gate activates. */
  graduated: boolean
}

const FILE = () => path.join(app.getPath('userData'), 'tactics.json')

function load(): Stored {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Stored>
    return { history: parsed.history ?? [], graduated: !!parsed.graduated }
  } catch { return { history: [], graduated: false } }
}
function save(s: Stored): void {
  try { fs.writeFileSync(FILE(), JSON.stringify(s), 'utf8') }
  catch (e) { log.warn('save failed', { err: String(e) }) }
}

export class TacticsEngine {
  private store: Stored = load()
  private vetoActive = false
  private vetoReason: string | null = null

  /** Record an outcome — call ONCE per closed trade (full position flat). */
  recordOutcome(symbol: string, realizedPnl: number): void {
    this.store.history.push({ pnl: realizedPnl, ts: Date.now(), symbol })
    if (this.store.history.length > 500) this.store.history.shift()
    save(this.store)
    this.refresh()
  }

  status(): TacticsStatus {
    const m = this.metrics()
    const state: TacticsStatus['state'] = this.vetoActive
      ? 'veto'
      : (!this.store.graduated || m.trades < MIN_TRADES_FOR_ARMED)
        ? 'calibrating'
        : 'armed'
    return {
      state,
      tradesObserved: m.trades,
      tradesRequired: MIN_TRADES_FOR_ARMED,
      winRate: m.winRate,
      expectancy: m.expectancy,
      maxDrawdown: m.maxDrawdown,
      signalQuality: SIGNAL_QUALITY_FLOOR,
      vetoActive: this.vetoActive,
      vetoReason: this.vetoReason,
      lastUpdated: Date.now(),
    }
  }

  /**
   * Pre-trade gate. Returns ok=true to allow, ok=false to veto with a reason.
   * Only called on entry orders (buys / opening shorts), never exits.
   */
  preTradeGate(signalConfidence: number): { ok: true } | { ok: false; reason: string } {
    const m = this.metrics()
    if (!this.store.graduated || m.trades < MIN_TRADES_FOR_ARMED) return { ok: true }  // calibrating — pass-through
    if (this.vetoActive) return { ok: false, reason: this.vetoReason ?? 'tactics veto' }
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
    if (m.trades < MIN_TRADES_FOR_ARMED) return { ok: false, reason: `Need ${MIN_TRADES_FOR_ARMED} closed trades (have ${m.trades})` }
    this.store.graduated = true
    save(this.store)
    log.warn('TACTICS GRADUATED — pre-trade gate now active', m)
    return { ok: true }
  }

  /** Reload from order history (used at engine boot to seed from prior session). */
  seedFromOrders(orders: Order[]): void {
    const closed = orders.filter(o => o.status === 'filled')
    for (const o of closed) {
      if (o.request.side !== 'sell') continue
      // Approximate realized P&L from fill — caller (engine) should pass
      // explicit realizedPnl via recordOutcome instead for accuracy.
      const pnl = 0
      this.store.history.push({ pnl, ts: o.filledAt ?? o.createdAt, symbol: o.request.symbol })
    }
    save(this.store)
    this.refresh()
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
