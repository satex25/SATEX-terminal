/**
 * SATEX — Economic Calendar Panel
 * Derives event rows from macro-tagged news items until a dedicated
 * window.satex.getCalendar / onCalendarUpdate IPC channel is wired in.
 */
import { useMemo } from 'react'
import { useMarketStore } from '../stores/marketStore'
import type { NewsItem } from '@shared/types'

interface CalRow {
  id: string
  time: string
  impact: 'high' | 'med' | 'low'
  title: string
  meta: string
}

function toRow(n: NewsItem): CalRow {
  const d = new Date(n.publishedAt)
  const time = d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' })
  const impact = n.kind === 'breaking' ? 'high' : n.kind === 'macro' ? 'med' : 'low'
  const meta = `${n.source}${n.symbol ? ` · ${n.symbol}` : ''}`
  return { id: n.id, time, impact, title: n.title, meta }
}

export function CalendarPanel() {
  const news = useMarketStore(s => s.news)
  const rows = useMemo(
    () => news
      .filter(n => n.kind === 'macro' || n.kind === 'breaking' || n.kind === 'earnings')
      .slice(0, 24)
      .map(toRow),
    [news],
  )

  if (rows.length === 0) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--ink-3)', fontSize: 11, textAlign: 'center', padding: 14 }}>
        <div>
          <div style={{ fontSize: 18, marginBottom: 6 }}>📅</div>
          Awaiting macro events…
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto' }}>
      {rows.map(r => (
        <div className="cal-event" key={r.id}>
          <div className="cal-time">{r.time}</div>
          <div className={`cal-impact ${r.impact}`} />
          <div>
            <div className="cal-event-title">{r.title}</div>
            <div className="cal-event-meta">{r.meta}</div>
          </div>
        </div>
      ))}
    </div>
  )
}
