/**
 * SATEX — Depth Ladder (Level-2 NBBO visualization)
 * Live L2 isn't wired to IPC yet — we derive a deterministic, visually-faithful
 * ladder from the current quote's bid/ask + a stable per-symbol RNG. The ladder
 * will be replaced with real depth feed when window.satex.onDepthUpdate is added.
 */
import { useMemo } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'

const LEVELS = 8

function hash(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
function rng(seed: number): () => number {
  let s = seed || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s & 0xffffff) / 0xffffff
  }
}

interface Level { price: number; size: number; total: number }

function ladder(side: 'bid' | 'ask', mid: number, tick: number, seed: number): Level[] {
  const next = rng(seed)
  const out: Level[] = []
  let total = 0
  for (let i = 0; i < LEVELS; i++) {
    const price = side === 'bid' ? mid - tick * (i + 1) : mid + tick * (i + 1)
    const size  = Math.max(1, Math.round(100 + next() * 1400))
    total += size
    out.push({ price, size, total })
  }
  return out
}

export function DepthPanel() {
  const symbol = useMarketStore(s => s.symbol)
  const quote  = useMarketStore(s => s.quotes.get(symbol))
  const dp     = findUniverseEntry(symbol)?.dp ?? 2

  const bidLast = quote?.bid ?? 0
  const askLast = quote?.ask ?? 0
  const mid     = (bidLast + askLast) / 2 || quote?.last || 0
  const tick    = Math.max(0.01, Math.abs(askLast - bidLast) || 0.05)

  // Stable per-(symbol, last-second) seed — refreshes when price moves
  const seedKey = `${symbol}-${Math.floor((quote?.timestamp ?? 0) / 1000)}`
  const seed    = useMemo(() => hash(seedKey), [seedKey])

  const bids = useMemo(() => ladder('bid', mid, tick, seed),     [mid, tick, seed])
  const asks = useMemo(() => ladder('ask', mid, tick, seed ^ 1), [mid, tick, seed])

  const maxTotal = Math.max(
    bids[bids.length - 1]?.total ?? 1,
    asks[asks.length - 1]?.total ?? 1,
  )

  const spread = askLast - bidLast
  const spreadBps = mid ? (spread / mid) * 10_000 : 0

  if (!quote) {
    return <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 11 }}>No quote</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="depth-table">
        <div className="hd">PRICE</div>
        <div className="hd" style={{ textAlign: 'right' }}>SIZE</div>
        <div className="hd" style={{ textAlign: 'right' }}>TOT</div>
        {asks.slice().reverse().map((lv, i) => (
          <Row key={`a-${i}`} kind="ask" lv={lv} dp={dp} maxTotal={maxTotal} />
        ))}
      </div>

      <div className="depth-spread">
        <span className="mono delta-up" style={{ textAlign: 'right' }}>{fmt.px(bidLast, dp)}</span>
        <span className="spread">{spread.toFixed(dp)} · {spreadBps.toFixed(1)} bps</span>
        <span className="mono delta-dn">{fmt.px(askLast, dp)}</span>
      </div>

      <div className="depth-table" style={{ flex: 1, overflow: 'hidden' }}>
        {bids.map((lv, i) => (
          <Row key={`b-${i}`} kind="bid" lv={lv} dp={dp} maxTotal={maxTotal} />
        ))}
      </div>
    </div>
  )
}

function Row({ kind, lv, dp, maxTotal }: { kind: 'bid' | 'ask'; lv: Level; dp: number; maxTotal: number }) {
  const pct = Math.min(100, (lv.total / maxTotal) * 100)
  return (
    <>
      <div className={`depth-row ${kind}`}>
        <span className="depth-bar" style={{ width: `${pct}%` }} />
        {fmt.px(lv.price, dp)}
      </div>
      <div className="depth-row size">{lv.size}</div>
      <div className="depth-row tot">{lv.total}</div>
    </>
  )
}
