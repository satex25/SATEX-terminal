/**
 * SATEX — MAY-TACTICS status + graduation dialog.
 * Leaving the calibrating state requires explicit user confirmation per the
 * locked invariant. Graduating activates the pre-trade signal-quality gate
 * for every subsequent entry order.
 */
import { useEffect, useState } from 'react'
import { Modal } from '../Modal'
import type { TacticsStatus } from '@shared/types'

interface Props { open: boolean; onClose: () => void }

export function TacticsModal({ open, onClose }: Props) {
  const [status, setStatus] = useState<TacticsStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!open) return
    setMsg(null)
    void refresh()
  }, [open])

  async function refresh() {
    try { const s = await window.satex?.getTacticsStatus(); if (s) setStatus(s) } catch { /* ignore */ }
  }

  async function graduate() {
    if (!window.satex || busy) return
    setBusy(true); setMsg(null)
    try {
      const res = await window.satex.graduateTactics()
      if (res.ok) {
        setMsg({ ok: true, text: 'MAY-TACTICS armed — pre-trade gate active on entries.' })
        await refresh()
      } else {
        setMsg({ ok: false, text: res.reason ?? 'Graduation refused' })
      }
    } catch (e) { setMsg({ ok: false, text: String(e) }) }
    setBusy(false)
  }

  const canGraduate = status?.state === 'calibrating' && status.graduationEligible
  // Which clause is holding graduation back (for a self-explaining disabled button).
  const unmetClause = status && status.state === 'calibrating' && !status.graduationEligible
    ? status.tradesObserved < status.tradesRequired
      ? `${status.tradesObserved} / ${status.tradesRequired} closed trades`
      : status.expectancy <= 0
        ? `expectancy ${status.expectancy.toFixed(2)} must be positive`
        : 'win rate below floor'
    : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`MAY-TACTICS · ${status?.state.toUpperCase() ?? '—'}`}
      kanji="策"
      size="default"
      footer={status?.state === 'calibrating' ? (
        <button
          type="button"
          className="dialog-btn primary"
          onClick={graduate}
          disabled={!canGraduate || busy}
        >
          {busy ? 'Graduating…' : 'Graduate to ARMED'}
        </button>
      ) : null}
    >
      {!status && <div className="form-hint">Loading…</div>}
      {status && (
        <>
          <div className="dialog-section">
            <div className="dialog-section-title">State</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {status.state === 'calibrating' && 'Collecting closed-trade evidence. Pre-trade gate is pass-through until graduated.'}
              {status.state === 'armed'       && 'Pre-trade gate is active. Entries below the signal-quality floor will be vetoed.'}
              {status.state === 'veto'        && (status.vetoReason ?? 'Drawdown exceeds floor — entries blocked until recovery.')}
            </div>
          </div>

          <div className="dialog-section">
            <div className="dialog-section-title">Metrics</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px', fontSize: 11 }}>
              <span style={{ color: 'var(--ink-3)' }}>Closed trades</span>
              <span><strong>{status.tradesObserved}</strong> / {status.tradesRequired}</span>

              <span style={{ color: 'var(--ink-3)' }}>Win rate</span>
              <span>{(status.winRate * 100).toFixed(1)}%</span>

              <span style={{ color: 'var(--ink-3)' }}>Expectancy</span>
              <span>{status.expectancy.toFixed(2)}</span>

              <span style={{ color: 'var(--ink-3)' }}>Max drawdown</span>
              <span>{(status.maxDrawdown * 100).toFixed(1)}%</span>

              <span style={{ color: 'var(--ink-3)' }}>Signal quality floor</span>
              <span>{(status.signalQuality * 100).toFixed(0)}%</span>
            </div>
          </div>

          {status.state === 'calibrating' && (
            <div
              className="dialog-section"
              style={{ background: 'var(--warn-soft, rgba(245,158,11,0.08))', borderLeft: '3px solid var(--warn-glow, #F59E0B)', padding: '10px 14px', borderRadius: '0 var(--r-s) var(--r-s) 0' }}
            >
              <strong>Checkpoint:</strong> Graduating activates a hard pre-trade gate. This is a user-confirmed transition and cannot be auto-promoted.
              {unmetClause && (
                <div style={{ marginTop: 6, color: 'var(--ink-3)' }}>
                  Not yet eligible — {unmetClause}.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {msg && <div className={`form-hint ${msg.ok ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>{msg.text}</div>}
    </Modal>
  )
}
