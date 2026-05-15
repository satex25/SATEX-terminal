/**
 * SATEX — Trading Journal Panel (Phase 11 · 2026-05-15).
 *
 * Source: modern-terminal-survey.md §6 — institutional terminals (TradeZella,
 * TraderSync, RizeTrade, Edgewonk) ship a per-trade journal with tags,
 * conviction, and a "lesson at exit" prompt. The vault already writes
 * Trades/*.md markdown on close; this panel surfaces those events live.
 *
 * MVP scope: list filled orders for the current session, color by side, show
 * source (manual / autonomous), triggeredBy badge (entry / stop / tp), and any
 * journal tags that were attached at submit. P&L-per-trade-pair, lesson
 * prompts, and per-tag aggregates land in a follow-up once trades start
 * actually closing in volume.
 */
import { useMemo } from 'react'
import { useAccountStore } from '../stores/accountStore'
import { fmt } from '../lib/format'
import type { Order } from '@shared/types'

const MAX_ROWS = 12

function triggeredBadge(o: Order): { label: string; tone: 'entry' | 'stop' | 'tp' | 'manual' } {
  const t = o.request.triggeredBy
  if (t === 'stop-loss')   return { label: 'STOP', tone: 'stop' }
  if (t === 'take-profit') return { label: 'TP',   tone: 'tp' }
  if (o.request.source === 'autonomous') return { label: 'AUTO', tone: 'entry' }
  return { label: 'MAN', tone: 'manual' }
}

function timeOf(ms: number | undefined): string {
  if (!ms) return '—'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

export function JournalPanel() {
  const orders = useAccountStore(s => s.orders)

  // Newest first, filled-only, capped.
  const rows = useMemo(() => {
    return orders
      .filter(o => o.status === 'filled')
      .sort((a, b) => (b.filledAt ?? 0) - (a.filledAt ?? 0))
      .slice(0, MAX_ROWS)
  }, [orders])

  return (
    <div className="journal-panel">
      <div className="jp-head">
        <span className="jp-title">JOURNAL</span>
        <span className="jp-meta">{rows.length} fills · session</span>
      </div>

      {rows.length === 0 ? (
        <div className="jp-empty">No fills yet. Submit an order to populate.</div>
      ) : (
        <div className="jp-rows">
          {rows.map(o => {
            const badge = triggeredBadge(o)
            const sideClass = o.request.side === 'buy' ? 'bull' : 'bear'
            const tags = o.request.tags ?? []
            const conv = o.request.conviction
            return (
              <div key={o.id} className="jp-row">
                <span className="jp-time">{timeOf(o.filledAt ?? o.createdAt)}</span>
                <span className={`jp-side ${sideClass}`}>{o.request.side.toUpperCase()}</span>
                <span className="jp-sym">{o.request.symbol}</span>
                <span className="jp-qty">{o.request.quantity}</span>
                <span className="jp-px">@ {o.fillPrice != null ? fmt.px(o.fillPrice, 2) : '—'}</span>
                <span className={`jp-badge t-${badge.tone}`}>{badge.label}</span>
                {conv != null && <span className="jp-conv">c{conv}</span>}
                {tags.length > 0 && (
                  <span className="jp-tags">
                    {tags.map(t => <span key={t} className="jp-tag">{t}</span>)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
