/**
 * SATEX — Top Movers Panel
 * Compact right-rail digest, inspired by the Coinbas Top Movers sidebar.
 * Two stacked groups: Top 5 Gainers and Top 5 Losers, both clickable to focus.
 * Pure derived view from marketStore — no IPC, no local state.
 */
import { useMemo } from 'react'
import { useMarketStore, useAllQuotes } from '../stores/marketStore'
import { Sparkline } from '../components/Sparkline'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'
import type { Quote } from '@shared/types'

const ROW_COUNT = 5

export function TopMoversPanel() {
  const quotes    = useAllQuotes()
  const symbol    = useMarketStore(s => s.symbol)
  const setSymbol = useMarketStore(s => s.setSymbol)

  const { gainers, losers } = useMemo(() => {
    const sorted = [...quotes].sort((a, b) => b.changePct - a.changePct)
    return {
      gainers: sorted.slice(0, ROW_COUNT),
      losers:  sorted.slice(-ROW_COUNT).reverse(),
    }
  }, [quotes])

  return (
    <div className="movers-shell scrollbar-thin">
      <MoversGroup title="Top Gainers" rows={gainers} symbol={symbol} onSelect={setSymbol} />
      <MoversGroup title="Top Losers"  rows={losers}  symbol={symbol} onSelect={setSymbol} />
    </div>
  )
}

function MoversGroup({
  title, rows, symbol, onSelect,
}: {
  title: string
  rows: Quote[]
  symbol: string
  onSelect: (s: string) => void
}) {
  return (
    <section className="movers-group">
      <header className="movers-head">
        <span className="section-eyebrow">{title}</span>
      </header>
      <ul className="movers-list">
        {rows.map(q => {
          const up = q.changePct >= 0
          const dp = findUniverseEntry(q.symbol)?.dp ?? 2
          const on = q.symbol === symbol
          return (
            <li
              key={q.symbol}
              className={`movers-row${on ? ' on' : ''}`}
              onClick={() => onSelect(q.symbol)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(q.symbol) }}
            >
              <span className={`movers-dot ${up ? 'up' : 'dn'}`} />
              <div className="movers-meta">
                <span className="movers-sym">{q.symbol}</span>
                <span className="movers-name">{q.name}</span>
              </div>
              <Sparkline data={q.sparkline} positive={up} width={44} height={18} />
              <div className="movers-price">
                <span className="num">{fmt.px(q.last, dp)}</span>
                <span className={`num ${up ? 'delta-up' : 'delta-dn'}`}>{fmt.pct(q.changePct)}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
