/**
 * SATEX — Exit-reflection modal (P0-2 complete · 2026-05-15).
 *
 * Source: modern-terminal-survey.md §6. Edgewonk / RizeTrade / TraderSync ship
 * a "lesson at exit" prompt that captures a one-line takeaway and an emotion
 * tag the moment a position flattens. Surfaces aggregates like "dollar cost
 * of revenge trades" and "high-conviction vs low-conviction PnL delta."
 *
 * Behavior:
 *   - Auto-opens when `useJournalStore().pendingReflection` becomes non-null
 *     (i.e. a new closed trade just landed).
 *   - User can fill lesson + emotion tag, save, or skip. Both paths clear
 *     `pendingReflection` so the modal doesn't re-open on the same trade.
 *   - Skipping leaves the trade in the panel without a lesson — no penalty,
 *     no nag.
 */
import { useEffect, useRef, useState } from 'react'
import { JOURNAL_TAGS, type JournalTag, type ClosedTrade } from '@shared/types'
import { useJournalStore } from '../../stores/journalStore'
import { fmt } from '../../lib/format'
import { Modal } from '../Modal'

function holdLabel(ms: number): string {
  if (ms <= 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export function ExitReflectionModal() {
  const pendingId  = useJournalStore(s => s.pendingReflection)
  const trades     = useJournalStore(s => s.trades)
  const submit     = useJournalStore(s => s.submitReflection)
  const dismiss    = useJournalStore(s => s.clearPendingReflection)

  const [lesson, setLesson] = useState('')
  const [tag,    setTag]    = useState<JournalTag | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Find the trade matching the pending id. If the store no longer has it
  // (capped out), close the prompt silently.
  const trade: ClosedTrade | undefined = pendingId
    ? trades.find(t => t.id === pendingId)
    : undefined

  // Reset form when the modal opens for a different trade.
  useEffect(() => {
    if (pendingId) {
      setLesson('')
      setTag(null)
      // Autofocus the textarea so the user can type immediately.
      const timer = setTimeout(() => inputRef.current?.focus(), 80)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [pendingId])

  if (!pendingId || !trade) return null

  const outcome = trade.pnl > 0 ? 'WIN' : trade.pnl < 0 ? 'LOSS' : 'FLAT'
  const pnlClass = trade.pnl > 0 ? 'bull' : trade.pnl < 0 ? 'bear' : ''

  function onSave() {
    if (!trade) return
    const cleaned = lesson.trim()
    void submit(trade.id, cleaned, tag ?? undefined)
  }

  return (
    <Modal
      open
      onClose={dismiss}
      title="Trade reflection"
      kanji="省"
      size="default"
      footer={
        <>
          <span style={{ flex: 1, fontSize: 10, color: 'var(--ink-3)' }}>
            Captured to <code style={{ fontFamily: 'var(--font-mono)' }}>Vault/Trades/</code>
          </span>
          <button type="button" className="dialog-btn" onClick={dismiss}>Skip</button>
          <button type="button" className="dialog-btn primary" onClick={onSave}>Save</button>
        </>
      }
    >
      <div className="reflect-modal">
        <div className="reflect-summary">
          <div className="reflect-row">
            <span className="lbl">{trade.symbol}</span>
            <span className={`val ${pnlClass}`}>{outcome} · {fmt.signed(trade.pnl, 2)}</span>
          </div>
          <div className="reflect-row sub">
            <span>{trade.quantity} @ {fmt.px(trade.entryPrice, 2)} → {fmt.px(trade.exitPrice, 2)}</span>
            <span>{holdLabel(trade.holdMs)}</span>
            {trade.regimeAtEntry && <span>{trade.regimeAtEntry}</span>}
            {trade.conviction != null && <span>c{trade.conviction}/10</span>}
          </div>
        </div>

        <div className="reflect-block">
          <label className="reflect-lbl" htmlFor="reflect-lesson">Lesson · one line</label>
          <textarea
            id="reflect-lesson"
            ref={inputRef}
            className="reflect-input"
            placeholder={
              outcome === 'LOSS'
                ? 'What did you misread? What rule did you break? What would you do differently?'
                : outcome === 'WIN'
                  ? 'What worked? Was it the setup, the execution, or both? Repeatable?'
                  : 'Anything to capture about this trade?'
            }
            value={lesson}
            onChange={e => setLesson(e.currentTarget.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); onSave() }
              if (e.key === 'Escape') { e.preventDefault(); dismiss() }
            }}
            rows={3}
            maxLength={400}
          />
        </div>

        <div className="reflect-block">
          <span className="reflect-lbl">Emotion tag · optional</span>
          <div className="reflect-tags">
            {JOURNAL_TAGS.map(t => (
              <button
                key={t}
                type="button"
                className={`reflect-tag${tag === t ? ' on' : ''}`}
                onClick={() => setTag(tag === t ? null : t)}
              >{t}</button>
            ))}
          </div>
        </div>

        <div className="reflect-hint">
          ⌘↵ to save · Esc to skip · Aggregated in JournalPanel and written to <code style={{ fontFamily: 'var(--font-mono)' }}>Trades/*.md</code>
        </div>
      </div>
    </Modal>
  )
}
