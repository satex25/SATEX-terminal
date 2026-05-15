/**
 * SATEX — Time & Sales Tape Panel (Phase 10.2 · 2026-05-15)
 *
 * Scrolling list of the most recent N quote ticks for the focused symbol with
 * size-weighted highlighting and uptick/downtick coloring. Closes the Bookmap
 * "time and sales tape" gap cheap — pure renderer code, no new IPC, no backend
 * changes.
 *
 * Design choices:
 *   - We piggy-back on the existing quote stream (marketStore.quotes Map).
 *     Each render captures `quote.last` for the focused symbol; if it changes
 *     from the prior render, that's one tape row.
 *   - "Big" trades highlighted when notional ≥ BIG_NOTIONAL_USD. Tunable.
 *   - Buffer cap MAX_TAPE_ROWS keeps memory bounded.
 *   - Side inferred from price-vs-mid: tick at-or-above ask = buy (uptick),
 *     at-or-below bid = sell (downtick). Mid → neutral. Crude vs trade-tape
 *     truth but useful for visual order-flow context until we wire dedicated
 *     trade event piping.
 */
import { useEffect, useRef, useState } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { PanelHead } from '../components/PanelHead'
import { fmt } from '../lib/format'
import { findUniverseEntry } from '@shared/constants'

interface TapeRow {
  id:     number
  ts:     number
  price:  number
  size:   number
  side:   'buy' | 'sell' | 'neutral'
}

const MAX_TAPE_ROWS = 60
const BIG_NOTIONAL_USD = 50_000

function fmtClock(ts: number): string {
  const d = new Date(ts)
  return d.toISOString().slice(11, 19) + '.' + String(d.getUTCMilliseconds()).padStart(3, '0').slice(0, 2)
}

export function TimeSalesPanel() {
  const symbol = useMarketStore(s => s.symbol)
  const quote  = useMarketStore(s => s.quotes.get(symbol))
  const entry  = findUniverseEntry(symbol)
  const dp     = entry?.dp ?? 2
  const [rows, setRows] = useState<TapeRow[]>([])
  const lastPrice  = useRef<number | null>(null)
  const lastTs     = useRef<number>(0)
  const idCounter  = useRef<number>(0)

  // Reset tape on symbol change — old prices shouldn't persist into the new
  // symbol's stream.
  useEffect(() => {
    setRows([])
    lastPrice.current = null
    lastTs.current = 0
  }, [symbol])

  // Tape capture — fires every time the quote object updates for the focused
  // symbol. We sample by timestamp delta to avoid duplicate rows when the same
  // quote re-renders for unrelated state changes.
  useEffect(() => {
    if (!quote) return
    if (quote.timestamp === lastTs.current) return
    if (lastPrice.current === null) {
      lastPrice.current = quote.last
      lastTs.current = quote.timestamp
      return
    }
    const mid = (quote.bid + quote.ask) / 2
    const side: TapeRow['side'] =
      quote.last > mid + 1e-6 ? 'buy' :
      quote.last < mid - 1e-6 ? 'sell' :
      quote.last > lastPrice.current ? 'buy' :
      quote.last < lastPrice.current ? 'sell' : 'neutral'
    const row: TapeRow = {
      id:    ++idCounter.current,
      ts:    quote.timestamp || Date.now(),
      price: quote.last,
      // Volume on Alpaca quote ticks reflects the leg size; for the sim
      // and quote-streams we approximate with bid+ask size from the message.
      // When trade-stream ticks come through, `size` carries the actual lot.
      size:  quote.volume > 0 && quote.volume < 1e9 ? Math.min(quote.volume, 100_000) : 0,
      side,
    }
    setRows(prev => {
      const next = [row, ...prev]
      return next.length > MAX_TAPE_ROWS ? next.slice(0, MAX_TAPE_ROWS) : next
    })
    lastPrice.current = quote.last
    lastTs.current = quote.timestamp
  }, [quote])

  return (
    <div className="bb-tape-panel">
      <PanelHead
        title="TIME & SALES · TAPE"
        right={<span>{symbol} · {rows.length}/{MAX_TAPE_ROWS}</span>}
      />
      <div className="bb-tape-body">
        {rows.length === 0 && (
          <div className="bb-tape-empty">Awaiting trades…</div>
        )}
        {rows.map(r => {
          const notional = r.price * r.size
          const big = notional >= BIG_NOTIONAL_USD
          const sideCls =
            r.side === 'buy'  ? 'bb-tape-buy' :
            r.side === 'sell' ? 'bb-tape-sell' : 'bb-tape-neutral'
          return (
            <div key={r.id} className={`bb-tape-row ${sideCls} ${big ? 'bb-tape-big' : ''}`}>
              <span className="bb-tape-time">{fmtClock(r.ts)}</span>
              <span className="bb-tape-price">{fmt.px(r.price, dp)}</span>
              <span className="bb-tape-size">{r.size > 0 ? fmt.k(r.size) : '—'}</span>
              <span className="bb-tape-side">
                {r.side === 'buy' ? '▲' : r.side === 'sell' ? '▼' : '·'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
