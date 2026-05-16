/**
 * SATEX — Trading Journal Panel (P0-2 complete · 2026-05-15).
 *
 * Source: modern-terminal-survey.md §6. Institutional terminals (TradeZella,
 * TraderSync, RizeTrade, Edgewonk) ship per-trade tags + conviction at entry,
 * a "lesson at exit" prompt, and an aggregates dashboard showing P&L sliced
 * by tag/regime/conviction. SATEX's vault already writes Trades/*.md on close;
 * this panel surfaces those closes live with realized PnL and aggregates.
 *
 * Layout:
 *   ┌─ Aggregates strip ──────────────────────────────────────────┐
 *   │ N trades · win-rate · total-pnl · high-conv-pnl · best/worst-tag │
 *   ├─ Closed-trade rows (most-recent first, capped at 14) ───────┤
 *   │ time · sym · qty @ entry → exit · pnl · hold · badge · tags │
 *   └─────────────────────────────────────────────────────────────┘
 */
import { useMemo } from 'react'
import { computeJournalAggregates, useJournalStore } from '../stores/journalStore'
import { fmt } from '../lib/format'
import type { ClosedTrade } from '@shared/types'

const MAX_ROWS = 14

function badgeFor(t: ClosedTrade): { label: string; tone: 'stop' | 'tp' | 'auto' | 'man' } {
  if (t.triggeredBy === 'stop-loss')   return { label: 'STOP', tone: 'stop' }
  if (t.triggeredBy === 'take-profit') return { label: 'TP',   tone: 'tp'   }
  if (t.source === 'autonomous')       return { label: 'AUTO', tone: 'auto' }
  return { label: 'MAN', tone: 'man' }
}

function timeOf(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

function holdLabel(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export function JournalPanel() {
  const trades = useJournalStore(s => s.trades)

  const rows = useMemo(() => {
    // Most-recent first, capped. Reversed copy so we don't mutate the store array.
    return [...trades].reverse().slice(0, MAX_ROWS)
  }, [trades])

  const agg = useMemo(() => computeJournalAggregates(trades), [trades])

  return (
    <div className="journal-panel">
      <div className="jp-head">
        <span className="jp-title">JOURNAL</span>
        <span className="jp-meta">{agg.count} closed · session</span>
      </div>

      {/* Aggregates strip — always rendered so the panel doesn't jump on
          first close. Numbers show "—" until the data lands. */}
      <div className="jp-agg">
        <div className="jp-agg-tile">
          <span className="lbl">P&amp;L</span>
          <span className={`val ${agg.totalPnl > 0 ? 'bull' : agg.totalPnl < 0 ? 'bear' : ''}`}>
            {agg.count > 0 ? fmt.signed(agg.totalPnl, 0) : '—'}
          </span>
        </div>
        <div className="jp-agg-tile">
          <span className="lbl">WIN%</span>
          <span className="val">
            {(agg.wins + agg.losses) > 0 ? `${(agg.winRate * 100).toFixed(0)}%` : '—'}
          </span>
        </div>
        <div className="jp-agg-tile">
          <span className="lbl">HI·CV</span>
          <span className={`val ${agg.highConvPnl > 0 ? 'bull' : agg.highConvPnl < 0 ? 'bear' : ''}`}>
            {agg.highConvPnl !== 0 ? fmt.signed(agg.highConvPnl, 0) : '—'}
          </span>
        </div>
        <div className="jp-agg-tile">
          <span className="lbl">LO·CV</span>
          <span className={`val ${agg.lowConvPnl > 0 ? 'bull' : agg.lowConvPnl < 0 ? 'bear' : ''}`}>
            {agg.lowConvPnl !== 0 ? fmt.signed(agg.lowConvPnl, 0) : '—'}
          </span>
        </div>
        <div className="jp-agg-tile">
          <span className="lbl">BEST·TAG</span>
          <span className="val">
            {agg.bestTag ? `${agg.bestTag.tag} ${fmt.signed(agg.bestTag.pnl, 0)}` : '—'}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="jp-empty">No closed trades yet. Open + flatten a position to populate.</div>
      ) : (
        <div className="jp-rows">
          {rows.map(t => {
            const badge   = badgeFor(t)
            const pnlClass = t.pnl > 0 ? 'bull' : t.pnl < 0 ? 'bear' : ''
            return (
              <div key={t.id} className="jp-row">
                <span className="jp-time">{timeOf(t.closedAt)}</span>
                <span className="jp-sym">{t.symbol}</span>
                <span className="jp-qty">{t.quantity}</span>
                <span className="jp-px">{fmt.px(t.entryPrice, 2)} → {fmt.px(t.exitPrice, 2)}</span>
                <span className={`jp-pnl ${pnlClass}`}>
                  {fmt.signed(t.pnl, 0)} · {(t.pnlPct * 100).toFixed(2)}%
                </span>
                <span className="jp-hold">{holdLabel(t.holdMs)}</span>
                <span className={`jp-badge t-${badge.tone}`}>{badge.label}</span>
                {t.conviction != null && <span className="jp-conv">c{t.conviction}</span>}
                {t.regimeAtEntry && <span className="jp-regime">{t.regimeAtEntry}</span>}
                {t.tags.length > 0 && (
                  <span className="jp-tags">
                    {t.tags.map(tag => <span key={tag} className="jp-tag">{tag}</span>)}
                  </span>
                )}
                {t.lesson && <span className="jp-lesson" title={t.lesson}>· {t.lesson.length > 40 ? t.lesson.slice(0, 40) + '…' : t.lesson}</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
