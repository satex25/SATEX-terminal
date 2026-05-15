/**
 * SATEX — L2 Depth Book Panel (Phase 10 · Black Box)
 *
 * Replaces DepthPanel. 7 asks above the spread row, 7 bids below. Volume bar
 * scales to cumulative-total max across all visible levels. Subscribes to the
 * depthStore (real depth-feed in main process).
 */
import { useEffect } from 'react'
import { useDepthStore } from '../stores/depthStore'
import { useMarketStore } from '../stores/marketStore'
import { PanelHead } from '../components/PanelHead'
import type { DepthLevel } from '@shared/types'

const VISIBLE_LEVELS = 7

interface BookRowProps {
  lv: DepthLevel
  side: 'ask' | 'bid'
  maxTot: number
}

function BookRow({ lv, side, maxTot }: BookRowProps) {
  const pct = Math.min(100, (lv.tot / Math.max(1, maxTot)) * 100)
  const color = side === 'ask' ? 'var(--bb-neg)' : 'var(--bb-pos)'
  return (
    <div className="bb-depth-row">
      <span className="bb-depth-bar" style={{ width: `${pct}%`, background: color }} />
      <span className="bb-depth-px" style={{ color }}>{lv.p.toFixed(2)}</span>
      <span />
      <span className="bb-depth-sz">{lv.size.toLocaleString()}</span>
      <span className="bb-depth-tot">{lv.tot.toLocaleString()}</span>
    </div>
  )
}

export function DepthBookPanel() {
  const snap = useDepthStore(s => s.snapshot)
  const symbol = useMarketStore(s => s.symbol)

  // Tell the main-process feed which symbol to focus on. Recomputes on switch.
  useEffect(() => {
    if (!window.satex?.subscribeDepth) return
    void window.satex.subscribeDepth(symbol)
  }, [symbol])

  if (!snap) {
    return (
      <div className="bb-depth-panel">
        <PanelHead title="DEPTH · L2" right="NBBO · NSDQ · ARCA · BATS" />
      </div>
    )
  }

  const asks = snap.asks.slice(0, VISIBLE_LEVELS)
  const bids = snap.bids.slice(0, VISIBLE_LEVELS)
  const maxTot = Math.max(
    asks[asks.length - 1]?.tot ?? 1,
    bids[bids.length - 1]?.tot ?? 1,
  )

  return (
    <div className="bb-depth-panel">
      <PanelHead title="DEPTH · L2" right={<span>NBBO · NSDQ · ARCA · BATS</span>} />
      <div className="bb-depth-cols">
        <span>PX</span>
        <span />
        <span style={{ textAlign: 'right' }}>SIZE</span>
        <span style={{ textAlign: 'right' }}>TOT</span>
      </div>
      {[...asks].reverse().map(lv => (
        <BookRow key={`a-${lv.p}`} lv={lv} side="ask" maxTot={maxTot} />
      ))}
      <div className="bb-depth-mid">
        <span className="bb-depth-mid-rule" />
        <span className="bb-depth-mid-px">{snap.mid.toFixed(2)}</span>
        <span className="bb-depth-mid-meta">SPR {snap.spread.toFixed(2)} · VPIN {snap.vpin.toFixed(2)}</span>
      </div>
      {bids.map(lv => (
        <BookRow key={`b-${lv.p}`} lv={lv} side="bid" maxTot={maxTot} />
      ))}
    </div>
  )
}
