/**
 * SATEX — Watchlist Panel (Phase 10 · Black Box)
 *
 * Grouped watchlist: FUTURES / FX · LONDON / INDICES / EQUITIES · TECH / CRYPTO.
 * Cyan-accented active row + 2px left border, filter input across the top.
 * Click row → marketStore.setSymbol(sym).
 */
import { useMemo, useState } from 'react'
import { useMarketStore, useAllQuotes } from '../stores/marketStore'
import { useFeedStore } from '../stores/feedStore'
import { Sparkline } from '../components/Sparkline'
import { PanelHead } from '../components/PanelHead'
import { useClocks } from '../hooks/useClocks'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'
import type { FeedStatus, Quote, SessionId } from '@shared/types'

interface Group { label: string; symbols: string[] }

/** Static group buckets — Black Box ribbons keyed to liquidity context.
 *  Symbols not in any bucket fall into a final OTHER group so nothing is lost. */
const GROUPS: ReadonlyArray<Group> = [
  { label: 'FUTURES',         symbols: ['ES','NQ','CL','GC','ZN'] },
  { label: 'FX · LONDON',     symbols: ['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCNH'] },
  { label: 'INDICES',         symbols: ['SPY','QQQ','DIA','IWM'] },
  { label: 'EQUITIES · TECH', symbols: ['NVDA','AAPL','MSFT','AMZN','META','GOOGL','AMD','TSLA'] },
  { label: 'CRYPTO',          symbols: ['BTC','ETH','SOL'] },
]

function priorityLabel(session: SessionId): string {
  return session === 'LONDON' ? 'FX-priority' : session === 'TOKYO' ? 'Asia-priority' : 'US-priority'
}

/** B3 (2026-05-18) — true when the symbol's asset class is *not* served by a
 *  live broker feed in the current session. Today futures are always
 *  synthetic (IEX has no futures), equity is live when WS is up, crypto is
 *  live when the v1beta3/crypto WS is up. The badge renders only on stale. */
function isSyntheticFeed(symbol: string, feed: FeedStatus): boolean {
  const entry = findUniverseEntry(symbol)
  const ac = entry?.assetClass
  if (ac === 'future') return feed.futures !== 'live'
  if (ac === 'crypto') return feed.crypto  !== 'live'
  if (ac === 'equity' || ac === 'index') return feed.equity !== 'live'
  return false
}

export function WatchlistPanel() {
  const quotes    = useAllQuotes()
  const symbol    = useMarketStore(s => s.symbol)
  const setSymbol = useMarketStore(s => s.setSymbol)
  const feed      = useFeedStore(s => s.status)
  const { session } = useClocks()
  const [filter, setFilter] = useState('')

  const grouped = useMemo(() => {
    const f = filter.trim().toUpperCase()
    const lookup = new Map<string, Quote>(quotes.map(q => [q.symbol, q]))
    const out: { label: string; items: Quote[] }[] = []
    const seen = new Set<string>()
    for (const g of GROUPS) {
      const items: Quote[] = []
      for (const sym of g.symbols) {
        const q = lookup.get(sym)
        if (!q) continue
        if (f && !q.symbol.includes(f) && !q.name.toUpperCase().includes(f)) continue
        items.push(q)
        seen.add(sym)
      }
      if (items.length > 0) out.push({ label: g.label, items })
    }
    // OTHER fallback for any quote not bucketed (shouldn't usually happen — defensive).
    const extras: Quote[] = []
    for (const q of quotes) {
      if (seen.has(q.symbol)) continue
      if (f && !q.symbol.includes(f) && !q.name.toUpperCase().includes(f)) continue
      extras.push(q)
    }
    if (extras.length > 0) out.push({ label: 'OTHER', items: extras })
    return out
  }, [quotes, filter])

  return (
    <div className="bb-watchlist">
      <PanelHead title="WATCHLIST" right={<span>{priorityLabel(session)}</span>} />
      <div className="bb-watchlist-filter">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter symbols…"
          aria-label="filter symbols"
        />
        <button type="button" className="bb-watchlist-tree" title="Browse symbol tree">+ TREE</button>
      </div>
      <div className="bb-watchlist-body">
        {grouped.map(g => (
          <div key={g.label} className="bb-watchlist-group">
            <div className="bb-watchlist-group-head">
              <span className="bb-watchlist-group-label">{g.label}</span>
              <span className="bb-watchlist-group-count">{g.items.length}</span>
            </div>
            {g.items.map(q => {
              const up = q.changePct >= 0
              const dp = findUniverseEntry(q.symbol)?.dp ?? 2
              const active = q.symbol === symbol
              const synthetic = isSyntheticFeed(q.symbol, feed)
              return (
                <div
                  key={q.symbol}
                  className={`bb-watchlist-row ${active ? 'active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSymbol(q.symbol)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSymbol(q.symbol) }}
                >
                  <div className="bb-watchlist-sym">
                    <div className="bb-watchlist-sym-tkr">
                      {q.symbol}
                      {synthetic && (
                        <span
                          className="bb-watchlist-feed-stale"
                          title="Synthetic seed — no live feed for this asset class"
                        >
                          SIM
                        </span>
                      )}
                    </div>
                    <div className="bb-watchlist-sym-name">{q.name}</div>
                  </div>
                  <Sparkline data={q.sparkline} positive={up} width={56} height={14} area={false} />
                  <div className="bb-watchlist-px">{fmt.px(q.last, dp)}</div>
                  <div className={`bb-watchlist-chg ${up ? 'bb-pos' : 'bb-neg'}`}>
                    {up ? '+' : ''}{q.changePct.toFixed(2)}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
