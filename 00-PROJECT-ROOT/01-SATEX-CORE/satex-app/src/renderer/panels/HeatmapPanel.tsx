/**
 * SATEX — Heatmap Panel
 * Universe grid coloured by daily % change. Click a tile to focus the symbol.
 */
import { useMarketStore, useAllQuotes } from '../stores/marketStore'
import { fmt } from '../lib/format'

function heatColor(pct: number): string {
  const v = Math.max(-5, Math.min(5, pct)) / 5  // [-1..1]
  if (v >= 0) {
    const a = 0.12 + v * 0.55
    return `rgba(34,197,94,${a.toFixed(3)})`
  } else {
    const a = 0.12 + Math.abs(v) * 0.55
    return `rgba(239,68,68,${a.toFixed(3)})`
  }
}

export function HeatmapPanel() {
  const quotes    = useAllQuotes()
  const setSymbol = useMarketStore(s => s.setSymbol)
  const focused   = useMarketStore(s => s.symbol)

  return (
    <div className="heatmap">
      {quotes.map(q => (
        <button
          key={q.symbol}
          type="button"
          className="heat-tile"
          onClick={() => setSymbol(q.symbol)}
          style={{
            background: heatColor(q.changePct),
            border: `1px solid ${q.symbol === focused ? 'var(--accent)' : 'transparent'}`,
            cursor: 'pointer',
          }}
        >
          <div className="sym">{q.symbol}</div>
          <div className="pct" style={{ color: q.changePct >= 0 ? 'var(--bull-glow)' : 'var(--bear-glow)' }}>
            {fmt.pct(q.changePct)}
          </div>
        </button>
      ))}
    </div>
  )
}
