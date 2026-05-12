/**
 * SATEX — Order Manager (Risk Engine)
 * Eight-gate risk validation before every order submission.
 * Kill switch is global and cannot be bypassed by strategy signals.
 *
 * Gates (applied in order):
 *   1. Kill switch armed
 *   2. Market closed (live mode + non-crypto)
 *   3. Daily loss limit exceeded
 *   4. Max open positions reached
 *   5. Position concentration limit
 *   6. Buying power insufficient
 *   7. Live-mode notional cap (live mode only)
 *   8. MAY-TACTICS pre-trade gate (entry orders, when graduated)
 */
import type {
  Account, Order, OrderRequest, OrderStatus, OrderValidationResult, Position, StrategySignal
} from '@shared/types'
import {
  BUYING_POWER_MULT, DAILY_LOSS_LIMIT_PCT, MAX_OPEN_POSITIONS,
  MAX_POSITION_CONCENTRATION, STARTING_EQUITY
} from '@shared/constants'

export interface OrderValidationContext {
  /** Current quote/last price for the symbol — used for notional computation. */
  refPrice: number
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

export type OrderFillCallback  = (order: Order, position: Position | null) => void
export type KillSwitchCallback = () => void

export class OrderManager {
  private account: Account
  private orders   = new Map<string, Order>()
  private positions= new Map<string, Position>()
  private fillCbs  = new Set<OrderFillCallback>()
  private killCbs  = new Set<KillSwitchCallback>()
  private sessionStartEquity: number
  private isMarketOpen = false

  constructor(startingEquity = STARTING_EQUITY) {
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

  // ── Kill Switch ─────────────────────────────────────────────────────────────
  armKillSwitch(reason = 'manual'): void {
    if (this.account.killSwitchArmed) return
    this.account.killSwitchArmed = true
    log.warn('KILL SWITCH ARMED', { reason })
    for (const cb of this.killCbs) cb()
  }
  disarmKillSwitch(): void { this.account.killSwitchArmed = false; log.info('kill switch disarmed') }
  onKillSwitch(fn: KillSwitchCallback): () => void { this.killCbs.add(fn); return () => this.killCbs.delete(fn) }

  // ── Validation ──────────────────────────────────────────────────────────────
  validate(req: OrderRequest, ctx?: OrderValidationContext): OrderValidationResult {
    // Gate 1: kill switch (stop-loss/take-profit may bypass — they reduce risk)
    if (this.account.killSwitchArmed && req.triggeredBy !== 'stop-loss' && req.triggeredBy !== 'take-profit')
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
    const order: Order = { id: req.id ?? orderId(), createdAt: Date.now(), status, request: req }
    this.orders.set(order.id, order)
    log.info('order created', { id: order.id, symbol: req.symbol, side: req.side, qty: req.quantity })
    return order
  }

  fillOrder(id: string, fillPrice: number): void {
    const order = this.orders.get(id)
    if (!order) return
    order.status    = 'filled'
    order.filledAt  = Date.now()
    order.fillPrice = fillPrice
    this.applyFill(order, fillPrice)
    log.info('order filled', { id, symbol: order.request.symbol, side: order.request.side, fillPrice })
    for (const cb of this.fillCbs) cb(order, this.positions.get(order.request.symbol) ?? null)
  }

  rejectOrder(id: string, reason: string): void {
    const order = this.orders.get(id)
    if (!order) return
    order.status = 'rejected'; order.rejectionReason = reason
    log.warn('order rejected', { id, reason })
    for (const cb of this.fillCbs) cb(order, null)
  }

  cancelOrder(id: string): void {
    const order = this.orders.get(id)
    if (!order || order.status !== 'pending') return
    order.status = 'canceled'
    log.info('order canceled', { id })
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
  signalToRequest(signal: StrategySignal, notionalCap: number): OrderRequest {
    const price = this.account.equity / (this.account.equity / notionalCap)
    // qty is floored to 1 minimum
    const qty   = Math.max(1, Math.floor(notionalCap / (price || 1)))
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
        this.account.cash += cost + pnl
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
    let unrealized = 0
    for (const p of this.positions.values()) unrealized += p.unrealizedPnl
    this.account.equity  = this.account.cash + unrealized
    this.account.dailyPnl = this.account.equity - this.sessionStartEquity
  }
}
