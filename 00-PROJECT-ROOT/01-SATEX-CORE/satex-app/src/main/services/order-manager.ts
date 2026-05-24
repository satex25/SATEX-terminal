/**
 * SATEX — Order Manager (Risk Engine)
 * Nine-gate risk validation before every order submission.
 * Kill switch is global and cannot be bypassed by strategy signals.
 *
 * Gates (applied in order):
 *   0. Quote freshness (refPriceAge ≤ MAX_QUOTE_AGE_MS)
 *   1. Kill switch armed
 *   2. Market closed (live mode + non-crypto)
 *   3. Daily loss limit exceeded
 *   4. Max open positions reached
 *   5. Position concentration limit
 *   6. Buying power insufficient
 *   7. Live-mode notional cap (live mode only)
 *   8. MAY-TACTICS pre-trade gate (entry orders, when graduated)
 */
const MAX_QUOTE_AGE_MS = 5_000
import type {
  Account, Order, OrderRequest, OrderStatus, OrderValidationResult, Position, StrategySignal
} from '@shared/types'
import {
  BUYING_POWER_MULT, DAILY_LOSS_LIMIT_PCT, MAX_OPEN_POSITIONS,
  MAX_POSITION_CONCENTRATION, DEFAULT_EQUITY
} from '@shared/constants'
import { randomUUID } from 'node:crypto'

export interface OrderValidationContext {
  /** Current quote/last price for the symbol — used for notional computation. */
  refPrice: number
  /**
   * Age in ms of the refPrice quote. Gate 0 rejects when this exceeds
   * MAX_QUOTE_AGE_MS — prevents trading on stale data after a WS drop.
   * Required for live-mode orders; ignored when liveMode=false to keep
   * paper/simulator testing frictionless during deliberate offline sessions.
   */
  refPriceAge?: number
  /** When true, market-hours gate is checked. */
  liveMode: boolean
  /** Per-order notional cap (USD); only enforced when liveMode is true. */
  notionalCap: number
  /** Optional tactics gate callback. Returns ok=false to veto. Only called for entry orders. */
  tacticsGate?: (signalConfidence: number) => { ok: boolean; reason?: string }
  /** Signal confidence (0..1) — passed to tacticsGate. */
  signalConfidence?: number
  /** Asset class — crypto bypasses the market-hours gate. */
  assetClass?: 'equity' | 'index' | 'future' | 'crypto'
}
import { orderId } from './id-generator'
import { createLogger } from './logger'

const log = createLogger('order-manager')

export type OrderFillCallback        = (order: Order, position: Position | null) => void
export type KillSwitchCallback       = () => void
export type KillSwitchChangeCallback = (armed: boolean, reason: string) => void

export class OrderManager {
  private account: Account
  private orders   = new Map<string, Order>()
  private positions= new Map<string, Position>()
  private fillCbs  = new Set<OrderFillCallback>()
  private killCbs  = new Set<KillSwitchCallback>()
  private killChangeCb?: KillSwitchChangeCallback
  private sessionStartEquity: number
  private isMarketOpen = false

  constructor(startingEquity = DEFAULT_EQUITY) {
    this.sessionStartEquity = startingEquity
    this.account = {
      equity:           startingEquity,
      cash:             startingEquity,
      buyingPower:      startingEquity * BUYING_POWER_MULT,
      openPositions:    [],
      dailyPnl:         0,
      dailyLossLimitPct:DAILY_LOSS_LIMIT_PCT,
      mode:             'paper',
      killSwitchArmed:  false,
      sessionStartedAt: Date.now(),
    }
    log.info('order manager initialized', { startingEquity })
  }

  // ── Public state ────────────────────────────────────────────────────────────
  getAccount(): Account    { return { ...this.account, openPositions: Array.from(this.positions.values()) } }
  getOrders():  Order[]    { return Array.from(this.orders.values()) }
  getPosition(sym: string): Position | undefined { return this.positions.get(sym) }
  setMarketOpen(open: boolean): void { this.isMarketOpen = open }
  /** Inspection helper used by the trading-engine sync path. */
  getSessionStartEquity(): number { return this.sessionStartEquity }

  /** Reset the session's starting equity to the broker-reported value.
   *
   *  Called by the trading-engine on the FIRST Alpaca account sync of the
   *  session. Before this exists the OM is constructed with the local
   *  DEFAULT_EQUITY constant, which has no relationship to the user's
   *  actual Alpaca equity. The daily-loss gate (`Gate 3`), the auto-arm
   *  kill switch in applyFill, and the dailyPnl rebuild all use
   *  `sessionStartEquity` as the baseline — leaving it as a stale constant
   *  silently breaks every one of them when actual equity diverges.
   *
   *  Adversarial finding C2 (2026-05-16). Refuses non-positive equity so
   *  a transient Alpaca response of `{"equity":"0"}` (account in
   *  liquidation, brand-new account) can't poison the baseline. */
  setSessionStartEquity(equity: number): void {
    if (!(equity > 0) || !Number.isFinite(equity)) {
      log.warn('refusing to set sessionStartEquity to non-positive value', { equity })
      return
    }
    const prior = this.sessionStartEquity
    this.sessionStartEquity = equity
    // Reset dailyPnl so it's measured against the new baseline immediately;
    // otherwise the next push would show a phantom PnL equal to the equity
    // delta between prior baseline and new baseline.
    this.account.dailyPnl = this.account.equity - equity
    log.info('session start equity reset', { prior, next: equity, dailyPnl: this.account.dailyPnl })
  }

  /** Reset to a fresh paper sandbox — used by the data-feed switch when
   *  entering Simulator. Clears all positions + orders and rebuilds the
   *  account at `startingEquity`. The kill-switch latch is intentionally
   *  PRESERVED: a feed swap must never silently re-enable trading. */
  resetToPaper(startingEquity = DEFAULT_EQUITY): void {
    this.positions.clear()
    this.orders.clear()
    this.sessionStartEquity = startingEquity
    this.account = {
      equity:           startingEquity,
      cash:             startingEquity,
      buyingPower:      startingEquity * BUYING_POWER_MULT,
      openPositions:    [],
      dailyPnl:         0,
      dailyLossLimitPct: DAILY_LOSS_LIMIT_PCT,
      mode:             'paper',
      killSwitchArmed:  this.account.killSwitchArmed,
      sessionStartedAt: Date.now(),
    }
  }

  // ── Kill Switch ─────────────────────────────────────────────────────────────
  armKillSwitch(reason = 'manual'): void {
    if (this.account.killSwitchArmed) return
    this.account.killSwitchArmed = true
    log.warn('KILL SWITCH ARMED', { reason })
    for (const cb of this.killCbs) cb()
    this.killChangeCb?.(true, reason)
  }
  disarmKillSwitch(): void {
    if (!this.account.killSwitchArmed) return
    this.account.killSwitchArmed = false
    log.info('kill switch disarmed')
    this.killChangeCb?.(false, '')
  }
  onKillSwitch(fn: KillSwitchCallback): () => void { this.killCbs.add(fn); return () => this.killCbs.delete(fn) }

  /** Register a persistence sink fired on every arm/disarm transition (including
   *  the daily-loss auto-arm in applyFill). Boot-time restoreKillSwitch() does
   *  NOT fire this — the state was just loaded from the same sink. */
  setOnKillSwitchChange(cb: KillSwitchChangeCallback): void { this.killChangeCb = cb }

  /** Restore armed state at boot from persistent storage. Fires the operational
   *  killCbs (so the engine broadcasts the account update and the renderer's
   *  account-pill paints red on first frame) but skips the change callback —
   *  the persistence layer is the source of this restore and re-saving would
   *  bump updatedAt without semantic value. No-op if already armed or restoring
   *  a disarmed state. */
  restoreKillSwitch(reason: string): void {
    if (this.account.killSwitchArmed) return
    this.account.killSwitchArmed = true
    log.warn('KILL SWITCH RESTORED FROM DISK', { reason })
    for (const cb of this.killCbs) cb()
  }

  // ── Validation ──────────────────────────────────────────────────────────────
  /** Pre-trade risk validation. Gates fire in order; first failure wins.
   *
   *  2026-05-16 (adversarial finding C1) — removed `triggeredBy === 'stop-loss'`
   *  / `'take-profit'` carve-outs from Gates 0 and 1. The old logic exempted
   *  any order tagged as a stop/TP from freshness, kill-switch, and tactics
   *  checks on the theory that "stops reduce risk so they're always safe to
   *  send." But the tag was renderer-supplied and never set by any internal
   *  code path, so the only callers exercising the bypass were hostile/buggy.
   *  Today's reality: bracket child orders execute server-side at Alpaca and
   *  never round-trip through this validator; the local engine never emits a
   *  standalone stop order. If we ever add programmatic close-on-regime-flip
   *  exits, those should bypass the kill switch through an EXPLICIT internal
   *  flag (not a string copied from the request), and that future flag must
   *  be unsettable from any IPC payload. */
  validate(req: OrderRequest, ctx?: OrderValidationContext): OrderValidationResult {
    // Gate 0: quote freshness (live mode only — paper mode tolerates simulator gaps).
    // D6 (2026-05-18) — defense-in-depth against NaN refPriceAge. WS-boundary
    // input guards prevent NaN at ingest, but Gate 0 is the LAST place a stale
    // or invalid quote can be caught before a live order is sent. A non-finite
    // refPriceAge is treated identically to "exceeded threshold" — refuse.
    // Pre-fix: `NaN > MAX_QUOTE_AGE_MS` evaluates to false, so the gate failed
    // open and let stale-feed orders through.
    if (ctx?.liveMode
        && ctx.refPriceAge !== undefined
        && (!Number.isFinite(ctx.refPriceAge) || ctx.refPriceAge > MAX_QUOTE_AGE_MS)) {
      const ageDesc = Number.isFinite(ctx.refPriceAge) ? `${ctx.refPriceAge}ms` : 'non-finite'
      return {
        ok: false,
        reason: `Quote stale (${ageDesc} vs ${MAX_QUOTE_AGE_MS}ms cap) — refusing live order`,
        gate: 'stale-quote',
      }
    }

    // Gate 1: kill switch — halts ALL order submission, no carve-outs.
    if (this.account.killSwitchArmed)
      return { ok: false, reason: 'Kill switch is armed', gate: 'kill-switch' }

    // Gate 2: market closed (live mode + non-crypto only)
    if (ctx?.liveMode && ctx.assetClass !== 'crypto' && !this.isMarketOpen)
      return { ok: false, reason: 'US equity market is closed', gate: 'market-closed' }

    // Gate 3: daily loss limit
    const dailyLoss = this.sessionStartEquity - this.account.equity
    if (dailyLoss >= this.sessionStartEquity * this.account.dailyLossLimitPct)
      return { ok: false, reason: `Daily loss limit reached (${(this.account.dailyLossLimitPct * 100).toFixed(1)}%)`, gate: 'daily-loss' }

    if (req.side === 'buy') {
      const refPrice = ctx?.refPrice && ctx.refPrice > 0 ? ctx.refPrice : (this.account.equity / Math.max(1, req.quantity))
      const notional = refPrice * req.quantity

      // Gate 4: max open positions
      const openCount = this.positions.size
      if (openCount >= MAX_OPEN_POSITIONS && !this.positions.has(req.symbol))
        return { ok: false, reason: `Max open positions (${MAX_OPEN_POSITIONS}) reached`, gate: 'max-positions' }

      // Gate 5: concentration
      const concentration = notional / Math.max(1, this.account.equity)
      if (concentration > MAX_POSITION_CONCENTRATION)
        return { ok: false, reason: `Position concentration ${(concentration * 100).toFixed(1)}% > ${(MAX_POSITION_CONCENTRATION * 100).toFixed(0)}%`, gate: 'concentration' }

      // Gate 6: buying power
      if (notional > this.account.buyingPower)
        return { ok: false, reason: 'Insufficient buying power', gate: 'buying-power' }

      // Gate 7: live-mode notional cap (live mode only)
      if (ctx?.liveMode && ctx.notionalCap > 0 && notional > ctx.notionalCap)
        return { ok: false, reason: `Notional $${notional.toFixed(0)} exceeds live cap $${ctx.notionalCap}`, gate: 'notional-cap' }

      // Gate 8: MAY-TACTICS pre-trade gate (entry orders only, when graduated)
      if (ctx?.tacticsGate) {
        const verdict = ctx.tacticsGate(ctx.signalConfidence ?? 0.5)
        if (!verdict.ok) return { ok: false, reason: verdict.reason ?? 'Tactics veto', gate: 'tactics' }
      }
    }

    return { ok: true }
  }

  // ── Order lifecycle ─────────────────────────────────────────────────────────
  createOrder(req: OrderRequest, status: OrderStatus = 'pending'): Order {
    // A4 — every Order gets a traceId at create time. crypto.randomUUID
    // gives us 122 bits of entropy with zero coordination, which is plenty
    // for log correlation (collision probability is negligible even at
    // billions of orders/day for years). The id is included on every log
    // line that touches this order so a post-mortem can reconstruct the
    // full lifecycle by grepping the rotating log files.
    const order: Order = {
      id: req.id ?? orderId(),
      traceId: randomUUID(),
      createdAt: Date.now(),
      status,
      request: req,
    }
    this.orders.set(order.id, order)
    log.info('order created', { id: order.id, traceId: order.traceId, symbol: req.symbol, side: req.side, qty: req.quantity })
    return order
  }

  fillOrder(id: string, fillPrice: number): void {
    const order = this.orders.get(id)
    if (!order) return
    order.status    = 'filled'
    order.filledAt  = Date.now()
    order.fillPrice = fillPrice
    this.applyFill(order, fillPrice)
    log.info('order filled', { id, traceId: order.traceId, symbol: order.request.symbol, side: order.request.side, fillPrice })
    for (const cb of this.fillCbs) cb(order, this.positions.get(order.request.symbol) ?? null)
  }

  rejectOrder(id: string, reason: string): void {
    const order = this.orders.get(id)
    if (!order) return
    order.status = 'rejected'; order.rejectionReason = reason
    log.warn('order rejected', { id, traceId: order.traceId, reason })
    for (const cb of this.fillCbs) cb(order, null)
  }

  cancelOrder(id: string): void {
    const order = this.orders.get(id)
    if (!order || order.status !== 'pending') return
    order.status = 'canceled'
    log.info('order canceled', { id, traceId: order.traceId })
    for (const cb of this.fillCbs) cb(order, null)
  }

  onOrderFill(fn: OrderFillCallback): () => void { this.fillCbs.add(fn); return () => this.fillCbs.delete(fn) }

  // ── Price updates (for unrealized P&L) ──────────────────────────────────────
  updatePositionPrice(symbol: string, price: number): void {
    const pos = this.positions.get(symbol)
    if (!pos) return
    pos.unrealizedPnl = (price - pos.avgPrice) * pos.quantity
    this.rebuildEquity()
  }

  // ── Sync from Alpaca (live mode) ─────────────────────────────────────────────
  syncFromAlpaca(snap: { equity: number; cash: number; buyingPower: number }, alpacaPositions: Position[]): void {
    this.account.equity      = snap.equity
    this.account.cash        = snap.cash
    this.account.buyingPower = snap.buyingPower
    this.positions.clear()
    for (const p of alpacaPositions) this.positions.set(p.symbol, p)
    this.account.openPositions = alpacaPositions
    this.account.dailyPnl      = snap.equity - this.sessionStartEquity
    log.debug('account synced from alpaca', { equity: snap.equity, positions: alpacaPositions.length })
  }

  // ── Signal helpers ───────────────────────────────────────────────────────────
  /** Convert a strategy signal into an order request sized to fit `notionalCap`.
   *
   *  `refPrice` is the current quoted/last price for the symbol. Caller must
   *  supply a positive price — typically `market.getQuote(symbol).last` or a
   *  candle close. A non-positive refPrice falls back to qty=1 so the caller
   *  still gets a syntactically-valid order (and the engine's downstream
   *  Gate 0 stale-quote check will reject it under live mode).
   *
   *  Prior to 2026-05-16 this function used `equity / (equity / notionalCap)`
   *  which is algebraically `notionalCap`, then `floor(notionalCap /
   *  notionalCap)` which is always 1 — so every autonomous order was
   *  silently sized to 1 share regardless of cap. Closes adversarial
   *  finding C3.
   */
  signalToRequest(signal: StrategySignal, notionalCap: number, refPrice: number): OrderRequest {
    const safePrice = refPrice > 0 ? refPrice : 0
    const qty = safePrice > 0
      ? Math.max(1, Math.floor(notionalCap / safePrice))
      : 1
    return {
      symbol:    signal.symbol,
      side:      signal.action,
      type:      'market',
      quantity:  qty,
      stopLoss:  signal.stopLossHint,
      takeProfit:signal.takeProfitHint,
      source:    signal.setup,
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────────
  private applyFill(order: Order, fillPrice: number): void {
    const { symbol, side, quantity } = order.request
    const cost = fillPrice * quantity

    if (side === 'buy') {
      this.account.cash      -= cost
      this.account.buyingPower -= cost * BUYING_POWER_MULT
      const existing = this.positions.get(symbol)
      if (existing) {
        const totalQty = existing.quantity + quantity
        existing.avgPrice = (existing.avgPrice * existing.quantity + cost) / totalQty
        existing.quantity = totalQty
      } else {
        this.positions.set(symbol, {
          symbol, quantity, avgPrice: fillPrice,
          unrealizedPnl: 0, realizedPnl: 0, openedAt: Date.now(),
          stopLoss: order.request.stopLoss, takeProfit: order.request.takeProfit,
        })
      }
    } else {
      const existing = this.positions.get(symbol)
      if (existing) {
        const pnl = (fillPrice - existing.avgPrice) * quantity
        existing.realizedPnl += pnl
        // Sell proceeds = fillPrice * quantity = `cost`. The realized PnL is
        // already implicit in `cost` (the delta between cost and the original
        // avgPrice*qty entry outlay). Pre-2026-05-18 this line was
        // `cash += cost + pnl`, which double-counted the PnL component and
        // left paper-mode cash inflated by `pnl` on every closed position
        // (live mode masked it within 15s via syncFromAlpaca).
        this.account.cash += cost
        this.account.buyingPower += cost * BUYING_POWER_MULT
        existing.quantity -= quantity
        if (existing.quantity <= 0) this.positions.delete(symbol)
      }
    }
    this.account.openPositions = Array.from(this.positions.values())
    this.rebuildEquity()

    // Auto-arm kill switch on large single-trade loss
    const dailyLoss = this.sessionStartEquity - this.account.equity
    if (dailyLoss >= this.sessionStartEquity * this.account.dailyLossLimitPct) {
      this.armKillSwitch('daily-loss-limit')
    }
  }

  private rebuildEquity(): void {
    // Equity = cash + mark-to-market value of open positions.
    // Position value = qty * lastKnownPrice = qty * avgPrice + unrealizedPnl
    // (the latter form is the one we have on hand — updatePositionPrice keeps
    // unrealizedPnl in sync with the current quote). Pre-2026-05-18 this only
    // summed unrealizedPnl, omitting the cost-basis component, so equity
    // dropped by the full position cost the instant a buy filled and only
    // recovered as the position moved into profit. Combined with the
    // sell-side cash double-count (fixed above) the math happened to cancel
    // at flat — but during holds and on winning closes the numbers diverged.
    let positionValue = 0
    for (const p of this.positions.values()) {
      positionValue += p.quantity * p.avgPrice + p.unrealizedPnl
    }
    this.account.equity  = this.account.cash + positionValue
    this.account.dailyPnl = this.account.equity - this.sessionStartEquity
  }
}
