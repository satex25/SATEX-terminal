/**
 * SATEX — Markets Overview Panel
 * Centerpiece of the "Markets" workspace. Synthesizes the entire universe into
 * (1) four hero stat tiles (Top Gainer / Top Loser / Most Volume / Most Volatile)
 * and (2) a sortable price table with $TAG symbol pills, live price, 24H %,
 * volume, est. notional, sparkline, and a one-click BUY action.
 *
 * Layout inspiration: LayerAI agents list (column structure) +
 *                     Coinbas price table (sparkline + action button).
 * Trading-grade restraint: no extra CJK glyphs added; existing kanji preserved
 * via shared globals.css tokens only.
 */
import { useMemo, useState } from 'react'
import { useMarketStore, useAllQuotes } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import { Sparkline } from '../components/Sparkline'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'
import type { Quote, AssetClass } from '@shared/types'

type SortKey = 'symbol' | 'price' | 'changePct' | 'volume' | 'notional'
type SortDir = 'asc' | 'desc'

const ASSET_FILTERS: ReadonlyArray<{ key: AssetClass | 'all'; label: string }> = [
  { key: 'all',    label: 'ALL' },
  { key: 'equity', label: 'EQ' },
  { key: 'index',  label: 'IDX' },
  { key: 'future', label: 'FUT' },
  { key: 'crypto', label: 'CRY' },
]

function notional(q: Quote): number {
  // Best-effort proxy for market activity — last × volume.
  return (q.last || 0) * (q.volume || 0)
}

export function MarketsOverviewPanel() {
  const quotes    = useAllQuotes()
  const symbol    = useMarketStore(s => s.symbol)
  const setSymbol = useMarketStore(s => s.setSymbol)
  const armed     = useAccountStore(s => s.account.killSwitchArmed)

  const [filter,   setFilter]   = useState('')
  const [klass,    setKlass]    = useState<AssetClass | 'all'>('all')
  const [sortKey,  setSortKey]  = useState<SortKey>('changePct')
  const [sortDir,  setSortDir]  = useState<SortDir>('desc')

  // ── Hero stats — computed across the FULL universe, not the filtered view ──
  const heroes = useMemo(() => {
    if (quotes.length === 0) return null
    const byChange = [...quotes].sort((a, b) => b.changePct - a.changePct)
    const byVol    = [...quotes].sort((a, b) => notional(b) - notional(a))
    const byVolat  = [...quotes].sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    return {
      topGainer: byChange[0]!,
      topLoser:  byChange[byChange.length - 1]!,
      mostVol:   byVol[0]!,
      mostVolat: byVolat[0]!,
    }
  }, [quotes])

  // ── Filtered + sorted table rows ──
  const rows = useMemo(() => {
    const f = filter.trim().toUpperCase()
    const list = quotes.filter(q => {
      if (klass !== 'all' && q.assetClass !== klass) return false
      if (!f) return true
      return q.symbol.includes(f) || q.name.toUpperCase().includes(f)
    })
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      switch (sortKey) {
        case 'symbol':    return dir * a.symbol.localeCompare(b.symbol)
        case 'price':     return dir * ((a.last || 0) - (b.last || 0))
        case 'volume':    return dir * ((a.volume || 0) - (b.volume || 0))
        case 'notional':  return dir * (notional(a) - notional(b))
        case 'changePct':
        default:          return dir * (a.changePct - b.changePct)
      }
    })
    return list
  }, [quotes, filter, klass, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'symbol' ? 'asc' : 'desc') }
  }

  function quickBuy(q: Quote, e: React.MouseEvent) {
    e.stopPropagation()
    if (armed) return
    // Conservative default quantity — 1 share / 1 contract. User can refine
    // in the Order Ticket; this is a one-click "stage" action.
    setSymbol(q.symbol)
    // Surface the order ticket via the focused symbol; explicit submit lives
    // in OrderTicketPanel to keep this panel side-effect-light.
  }

  return (
    <div className="mkts-shell">
      {/* ── Hero stat tiles ─────────────────────────────────────────────── */}
      {heroes && (
        <div className="mkts-heroes">
          <HeroTile kind="gain"  label="Top Gainer"   q={heroes.topGainer}  onSelect={setSymbol} />
          <HeroTile kind="loss"  label="Top Loser"    q={heroes.topLoser}   onSelect={setSymbol} />
          <HeroTile kind="vol"   label="Most Volume"  q={heroes.mostVol}    onSelect={setSymbol} />
          <HeroTile kind="vlt"   label="Most Volatile" q={heroes.mostVolat} onSelect={setSymbol} />
        </div>
      )}

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="mkts-toolbar">
        <input
          type="text"
          className="mkts-search"
          placeholder="Search symbols · $NVDA · $SPY …"
          aria-label="Filter symbols"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <div className="seg" role="tablist" aria-label="Asset class filter">
          {ASSET_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={klass === key ? 'on' : ''}
              onClick={() => setKlass(key)}
              role="tab"
              aria-selected={klass === key}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="mkts-count">
          <i>{rows.length}</i>/{quotes.length}
        </span>
      </div>

      {/* ── Table ──────────────────────────────────────────────────────── */}
      <div className="mkts-table-wrap scrollbar-thin">
        <table className="mkts-table">
          <thead>
            <tr>
              <Th k="symbol"    active={sortKey} dir={sortDir} onClick={toggleSort} align="left">Symbol</Th>
              <th className="mkts-th name">Name</th>
              <Th k="price"     active={sortKey} dir={sortDir} onClick={toggleSort} align="right">Price</Th>
              <Th k="changePct" active={sortKey} dir={sortDir} onClick={toggleSort} align="right">24H</Th>
              <Th k="volume"    active={sortKey} dir={sortDir} onClick={toggleSort} align="right">Volume</Th>
              <Th k="notional"  active={sortKey} dir={sortDir} onClick={toggleSort} align="right">Notional</Th>
              <th className="mkts-th spark">Trend</th>
              <th className="mkts-th act"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="mkts-empty">No matches</td></tr>
            ) : rows.map(q => {
              const up   = q.changePct >= 0
              const dp   = findUniverseEntry(q.symbol)?.dp ?? 2
              const isOn = q.symbol === symbol
              return (
                <tr
                  key={q.symbol}
                  className={`mkts-row${isOn ? ' on' : ''}`}
                  onClick={() => setSymbol(q.symbol)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') setSymbol(q.symbol) }}
                >
                  <td className="mkts-td symbol">
                    <span className={`sym-tag cls-${q.assetClass}`}>${q.symbol}</span>
                  </td>
                  <td className="mkts-td name">{q.name}</td>
                  <td className="mkts-td price num">{fmt.px(q.last, dp)}</td>
                  <td className={`mkts-td chg num ${up ? 'delta-up' : 'delta-dn'}`}>{fmt.pct(q.changePct)}</td>
                  <td className="mkts-td vol num">{fmt.k(q.volume)}</td>
                  <td className="mkts-td not num">${fmt.k(notional(q))}</td>
                  <td className="mkts-td spark">
                    <Sparkline data={q.sparkline} positive={up} width={88} height={26} />
                  </td>
                  <td className="mkts-td act">
                    <button
                      type="button"
                      className="mkts-buy"
                      onClick={e => quickBuy(q, e)}
                      disabled={armed}
                      aria-label={`Stage buy for ${q.symbol}`}
                      title={armed ? 'Kill switch armed' : `Stage buy ${q.symbol}`}
                    >
                      Buy
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Hero tile ───────────────────────────────────────────────────────────────
function HeroTile({
  kind, label, q, onSelect,
}: {
  kind: 'gain' | 'loss' | 'vol' | 'vlt'
  label: string
  q: Quote
  onSelect: (s: string) => void
}) {
  const up = q.changePct >= 0
  const dp = findUniverseEntry(q.symbol)?.dp ?? 2
  return (
    <button
      type="button"
      className={`hero-tile hero-${kind}`}
      onClick={() => onSelect(q.symbol)}
      aria-label={`${label}: ${q.symbol}`}
    >
      <div className="hero-head">
        <span className="hero-label">{label}</span>
        <span className={`hero-pct ${up ? 'delta-up' : 'delta-dn'}`}>{fmt.pct(q.changePct)}</span>
      </div>
      <div className="hero-body">
        <span className="hero-sym">${q.symbol}</span>
        <span className="hero-name">{q.name}</span>
      </div>
      <div className="hero-foot">
        <span className="hero-price num">{fmt.px(q.last, dp)}</span>
        <Sparkline data={q.sparkline} positive={up} width={72} height={22} />
      </div>
    </button>
  )
}

// ── Sortable header cell ────────────────────────────────────────────────────
function Th({
  k, active, dir, onClick, children, align,
}: {
  k: SortKey
  active: SortKey
  dir: SortDir
  onClick: (k: SortKey) => void
  children: React.ReactNode
  align: 'left' | 'right'
}) {
  const isActive = k === active
  return (
    <th
      className={`mkts-th sortable ${align} ${isActive ? 'active' : ''}`}
      onClick={() => onClick(k)}
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <span>{children}</span>
      <span className="sort-mark">{isActive ? (dir === 'asc' ? '▲' : '▼') : '·'}</span>
    </th>
  )
}
