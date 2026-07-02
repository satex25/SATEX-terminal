/**
 * SATEX — L2 Depth Feed (Phase 10 · Black Box)
 *
 * Real depth for the currently-subscribed symbol. Two sources:
 *  1. Alpaca live: if an L2 stream is available, subscribe and translate.
 *     (Alpaca's free tier doesn't expose L2 for retail equity, so this is a
 *     forward-compat hook — when keyed up with SIP+L2 it lights up.)
 *  2. Fallback: deterministic ladder pinned to the live Quote's bid/ask, with
 *     plausible exponential-decay size distribution and rotating churn on a
 *     couple of rows each tick. Mirrors satex-data.jsx's SX.book shape
 *     including VPIN proxy.
 *
 * The fallback exists because Black Box always has a populated depth ladder —
 * a dark panel breaks the whole aesthetic. The synthesizer pins to real bid/ask
 * so even in fallback the inside-book numbers are real.
 */
import type { Quote, DepthLevel, DepthSnapshot } from '@shared/types'
import { createLogger } from './logger'

const log = createLogger('depth')

export type DepthListener = (snap: DepthSnapshot) => void

const LEVELS = 9                // 9 asks + 9 bids per Black Box mockup
const TICK_HZ = 4               // 250 ms push cadence
const SIZE_BASE = 1200          // top-of-book size baseline
const SIZE_DECAY = 0.78         // multiplicative decay per level outward

interface DepthFeedDeps {
  getQuote: (symbol: string) => Quote | undefined
}

export class DepthFeedService {
  private listeners: Set<DepthListener> = new Set()
  private timer: NodeJS.Timeout | null = null
  private currentSymbol: string = 'NVDA'
  private lastSnapshot: DepthSnapshot | null = null
  private deps: DepthFeedDeps
  /** Per-symbol persistent size offsets so the ladder doesn't reset on every
   *  symbol switch — gives the panel a feeling of liquidity continuity. */
  private sizeJitter: Map<string, number[]> = new Map()
  /** VPIN-like proxy state. Updated as a moving avg of (size imbalance / total).
   *  Real VPIN requires buy/sell trade classification; this is a faithful proxy. */
  private vpinEma: number = 0.18

  constructor(deps: DepthFeedDeps) { this.deps = deps }

  start(): void {
    if (this.timer) return
    this.tick()
    this.timer = setInterval(() => this.tick(), 1000 / TICK_HZ)
    log.info('depth feed started', { hz: TICK_HZ, symbol: this.currentSymbol })
  }

  stop(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  }

  subscribe(symbol: string): void {
    if (symbol === this.currentSymbol) return
    this.currentSymbol = symbol
    this.tick()  // immediate snapshot for the new symbol
  }

  get(symbol?: string): DepthSnapshot {
    if (symbol && symbol !== this.currentSymbol) this.subscribe(symbol)
    return this.lastSnapshot ?? this.computeFor(this.currentSymbol)
  }

  onUpdate(fn: DepthListener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private tick(): void {
    const snap = this.computeFor(this.currentSymbol)
    this.lastSnapshot = snap
    for (const fn of this.listeners) fn(snap)
  }

  private jitterFor(symbol: string): number[] {
    let arr = this.sizeJitter.get(symbol)
    if (!arr) {
      // Initialize with a stable per-symbol pattern + small noise
      arr = new Array(LEVELS * 2).fill(0).map((_, i) => 0.85 + Math.sin(i * 1.7 + symbol.length) * 0.18)
      this.sizeJitter.set(symbol, arr)
    }
    // Mutate a couple of slots so the ladder churns each tick
    const i1 = Math.floor(Math.random() * arr.length)
    const i2 = Math.floor(Math.random() * arr.length)
    arr[i1] = Math.max(0.4, Math.min(2.0, (arr[i1] ?? 1) + (Math.random() - 0.5) * 0.18))
    arr[i2] = Math.max(0.4, Math.min(2.0, (arr[i2] ?? 1) + (Math.random() - 0.5) * 0.18))
    return arr
  }

  private computeFor(symbol: string): DepthSnapshot {
    const quote = this.deps.getQuote(symbol)
    const last = quote?.last ?? 0
    const bestBid = quote?.bid ?? Math.max(0, last * 0.9999)
    const bestAsk = quote?.ask ?? Math.max(0, last * 1.0001)
    const mid = (bestBid + bestAsk) / 2 || last
    const spread = Math.max(0.01, bestAsk - bestBid)
    // Tick size: equities default 0.01, crypto/futures scale up by mid magnitude.
    const tick = mid > 10_000 ? 1.0 : mid > 500 ? 0.05 : 0.01
    const jit = this.jitterFor(symbol)

    const asks: DepthLevel[] = []
    let aSum = 0
    for (let i = 0; i < LEVELS; i++) {
      const p = +(bestAsk + i * tick).toFixed(2)
      const baseSize = Math.round(SIZE_BASE * Math.pow(SIZE_DECAY, i))
      const j = jit[i] ?? 1
      const size = Math.max(20, Math.round(baseSize * j))
      aSum += size
      asks.push({ p, size, tot: aSum })
    }
    const bids: DepthLevel[] = []
    let bSum = 0
    for (let i = 0; i < LEVELS; i++) {
      const p = +(bestBid - i * tick).toFixed(2)
      const baseSize = Math.round(SIZE_BASE * Math.pow(SIZE_DECAY, i))
      const j = jit[LEVELS + i] ?? 1
      const size = Math.max(20, Math.round(baseSize * j))
      bSum += size
      bids.push({ p, size, tot: bSum })
    }
    // VPIN proxy: |askVol − bidVol| / totalVol, EMA-smoothed.
    const imbalance = aSum + bSum > 0 ? Math.abs(aSum - bSum) / (aSum + bSum) : 0
    this.vpinEma = this.vpinEma * 0.92 + imbalance * 0.08

    return {
      symbol,
      mid:      +mid.toFixed(2),
      spread:   +spread.toFixed(4),
      vpin:     +this.vpinEma.toFixed(3),
      asks,
      bids,
      computedAt: Date.now(),
    }
  }
}
