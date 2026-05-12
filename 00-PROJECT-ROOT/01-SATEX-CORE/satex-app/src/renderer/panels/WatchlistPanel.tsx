/**
 * SATEX — Watchlist Panel
 * Scrollable list of all universe symbols with live price, change%, sparkline.
 * Clicking a row sets the focused symbol in marketStore.
 */
import { useMemo, useState } from 'react'
import { useMarketStore, useAllQuotes } from '../stores/marketStore'
import { Sparkline } from '../components/Sparkline'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'
import type { Quote } from '@shared/types'

const GROUP_ORDER: Array<{ key: Quote['assetClass']; label: string }> = [
  { key: 'future', label: 'Futures' },
  { key: 'index',  label: 'Indices' },
  { key: 'equity', label: 'Equities' },
  { key: 'crypto', label: 'Crypto' },
]

export function WatchlistPanel() {
  const quotes    = useAllQuotes()
  const symbol    = useMarketStore(s => s.symbol)
  const setSymbol = useMarketStore(s => s.setSymbol)
  const [filter, setFilter] = useState('')

  const grouped = useMemo(() => {
    const f = filter.trim().toUpperCase()
    const groups: Record<string, Quote[]> = { future: [], index: [], equity: [], crypto: [] }
    for (const q of quotes) {
      if (f && !q.symbol.includes(f) && !q.name.toUpperCase().includes(f)) continue
      if (groups[q.assetClass]) groups[q.assetClass]!.push(q)
    }
    return groups
  }, [quotes, filter])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 6 }}>
      <input
        type="text"
        placeholder="Filter symbols…"
        value={filter}
        onChange={e => setFilter(e.target.value)}
        style={{ width: '100%', fontSize: 11, padding: '5px 8px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 5 }}
      />
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {GROUP_ORDER.map(({ key, label }) => {
          const list = grouped[key] ?? []
          if (list.length === 0) return null
          return (
            <div key={key}>
              <div className="section-eyebrow" style={{ padding: '0 6px 4px' }}>{label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {list.map(q => (
                  <QuoteRow
                    key={q.symbol}
                    q={q}
                    active={q.symbol === symbol}
                    onClick={() => setSymbol(q.symbol)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function QuoteRow({ q, active, onClick }: { q: Quote; active: boolean; onClick: () => void }) {
  const up = q.changePct >= 0
  const dp = findUniverseEntry(q.symbol)?.dp ?? 2
  return (
    <div className={`quote-row${active ? ' active' : ''}`} onClick={onClick} role="button" tabIndex={0}>
      <div style={{ minWidth: 0 }}>
        <div className="quote-sym">{q.symbol}</div>
        <div className="quote-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {q.name}
        </div>
      </div>
      <div>
        <div className="quote-price">{fmt.px(q.last, dp)}</div>
        <div className={`quote-delta ${up ? 'delta-up' : 'delta-dn'}`}>{fmt.pct(q.changePct)}</div>
      </div>
      <Sparkline data={q.sparkline} positive={up} width={52} height={20} />
    </div>
  )
}
