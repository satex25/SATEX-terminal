/**
 * SATEX — Ticker Tape (Phase 10 · Black Box)
 *
 * 26px session-aware marquee. Items filter by liquidity session (Tokyo asia,
 * London FX, NY equities-led) so the tape shifts with the clock. Pause-on-hover
 * is a CSS-only affordance via `animation-play-state`.
 */
import { useMemo } from 'react'
import { useClocks } from '../hooks/useClocks'
import { useAllQuotes } from '../stores/marketStore'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'
import type { Quote, SessionId } from '@shared/types'

const SESSION_PRIORITY: Record<SessionId, ReadonlyArray<string>> = {
  TOKYO:  ['USDJPY','NKY','HSI','CNH','KOSPI','AUDUSD','JGB10','SGX-CN','AUDJPY','CSI300','BTC','ETH','SOL','GC'],
  LONDON: ['EURUSD','GBPUSD','DAX','FTSE','BTP','BUND','GBPJPY','EURGBP','USDCHF','BRENT','GC','ZN','SPY','QQQ'],
  NY:     ['SPY','QQQ','NVDA','AAPL','MSFT','TSLA','META','BTC','ETH','VIX','TLT','DXY','DIA','IWM','AMD','GOOGL'],
}

function filterAndOrder(quotes: Quote[], session: SessionId): Quote[] {
  const priority = SESSION_PRIORITY[session]
  const inUniverse = new Map(quotes.map(q => [q.symbol, q]))
  // Priority list first (kept in order), then remainder.
  const out: Quote[] = []
  const seen = new Set<string>()
  for (const sym of priority) {
    const q = inUniverse.get(sym)
    if (q) { out.push(q); seen.add(sym) }
  }
  for (const q of quotes) {
    if (!seen.has(q.symbol)) out.push(q)
  }
  return out.slice(0, 16)
}

export function TickerTape() {
  const quotes = useAllQuotes()
  const { session } = useClocks()
  const ordered = useMemo(() => filterAndOrder(quotes, session), [quotes, session])
  // Triple for seamless scroll
  const doubled = [...ordered, ...ordered, ...ordered]

  return (
    <div className="bb-ticker-tape">
      <div className="bb-ticker-track">
        {doubled.map((q, i) => {
          const up = q.changePct >= 0
          const entry = findUniverseEntry(q.symbol)
          const dp = entry?.dp ?? 2
          return (
            <span key={`${q.symbol}-${i}`} className="bb-ticker-item">
              <span className="bb-ticker-sym">{q.symbol}</span>
              <span className="bb-ticker-px">{fmt.px(q.last, dp)}</span>
              <span className={up ? 'bb-pos' : 'bb-neg'}>
                {up ? '+' : ''}{q.changePct.toFixed(2)}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
