/**
 * SATEX — THE WIRE panel: tabbed live world-news channels.
 *
 * ALL + one tab per channel; items show a relative age that re-renders on a
 * 30s heartbeat, a ⚡ pulse for headlines under 2 minutes old, and click-
 * through to the default browser (window.open → main's scheme-allowlisted
 * setWindowOpenHandler → shell.openExternal; the renderer never navigates).
 */
import { useEffect, useMemo, useState } from 'react'
import { useWireStore } from '../stores/wireStore'
import type { WireItem } from '@shared/types'

const FRESH_MS = 2 * 60_000

function age(ts: number, now: number): string {
  const d = Math.max(0, now - ts)
  if (d < 60_000) return `${Math.floor(d / 1000)}s`
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`
  return `${Math.floor(d / 86_400_000)}d`
}

export function WirePanel() {
  const snap = useWireStore(s => s.snap)
  const [tab, setTab] = useState<string>('all')
  const [now, setNow] = useState(() => Date.now())

  // 30s heartbeat keeps the age stamps honest without re-rendering per tick.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  const items: WireItem[] = useMemo(() => {
    if (!snap) return []
    return tab === 'all' ? snap.items : snap.items.filter(i => i.sourceId === tab)
  }, [snap, tab])

  if (!snap) {
    return <div className="wire-empty">Warming up the wire…</div>
  }
  if (!snap.enabled) {
    return <div className="wire-empty">Wire is off — flip the ◉ THE WIRE chip to go live.</div>
  }

  return (
    <div className="wire">
      <div className="wire-tabs" role="tablist" aria-label="Wire channels">
        <button
          type="button" role="tab" aria-selected={tab === 'all'}
          className={`wire-tab ${tab === 'all' ? 'active' : ''}`}
          onClick={() => setTab('all')}
        >
          ALL
        </button>
        {snap.sources.map(src => (
          <button
            key={src.id}
            type="button" role="tab" aria-selected={tab === src.id}
            className={`wire-tab ${tab === src.id ? 'active' : ''} ${src.status === 'error' ? 'err' : ''}`}
            onClick={() => setTab(src.id)}
            title={src.status === 'error' ? `${src.label} — feed unreachable, retrying each poll` : `${src.label} — ${src.count} headlines`}
          >
            {src.label}
          </button>
        ))}
      </div>
      <div className="wire-body">
        {items.length === 0 && <div className="wire-empty">No headlines yet on this channel — first poll lands within seconds.</div>}
        {items.slice(0, 40).map(item => {
          const fresh = now - item.publishedAt < FRESH_MS
          return (
            <button
              key={item.id}
              type="button"
              className={`wire-item ${fresh ? 'fresh' : ''}`}
              onClick={() => window.open(item.link)}
              title={`${item.sourceLabel} — open in browser`}
            >
              <span className="wire-age">{fresh ? '⚡' : age(item.publishedAt, now)}</span>
              <span className="wire-src">{item.sourceLabel}</span>
              <span className="wire-title">{item.title}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
