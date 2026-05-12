/**
 * SATEX — Top ticker rail (32px row).
 * Marquee of live equity & index quotes. Driven by the marketStore.
 */
import { useAllQuotes } from '../stores/marketStore'
import { Sparkline } from './Sparkline'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'

export function TickerRail() {
  const quotes = useAllQuotes()
  // Use index + equity + crypto + futures (whole universe) for the rail
  const list = quotes
  const doubled = [...list, ...list]

  return (
    <div className="ticker-rail">
      <div className="ticker-track">
        {doubled.map((q, i) => {
          const up = q.changePct >= 0
          const entry = findUniverseEntry(q.symbol)
          const dp = entry?.dp ?? 2
          return (
            <div className="ticker-item" key={`${q.symbol}-${i}`}>
              <div>
                <div className="ticker-symbol">{q.symbol}</div>
                <div style={{ fontSize: 9, color: 'var(--ink-3)', fontFamily: 'var(--font-mono)' }}>{q.name}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                <div className="ticker-price">{fmt.px(q.last, dp)}</div>
                <div className={`ticker-delta ${up ? 'delta-up' : 'delta-dn'}`}>{fmt.pct(q.changePct)}</div>
              </div>
              <Sparkline data={q.sparkline} positive={up} width={50} height={18} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
