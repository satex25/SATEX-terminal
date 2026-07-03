/**
 * SATEX — Funded Account Panel (P-021)
 *
 * Operator-critical surface for Topstep / Apex / FTMO traders. Shows:
 *   • Phase badge (COMBINE | FUNDED | ACTIVATED)
 *   • Trailing MLL gauge with danger zone (last 20% buffer = amber, < 5% = red)
 *   • Daily P&L position vs daily loss limit
 *   • EOD flatten countdown (red when < 30 min)
 *   • Equity ledger sparkline (last 10 EOD closes)
 *
 * Two modes: expanded (full panel, docked in the Secondary row) and mini
 * (one-liner: phase pill + MLL% + daily P&L status — for BottomBar use).
 *
 * Design tokens: --bb-* CSS custom properties, JetBrains Mono typeface,
 * --bb-ambient for danger state.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useFundedAccountStore } from '../stores/fundedAccountStore'
import { useAccountStore } from '../stores/accountStore'
import { fmt } from '../lib/format'
import type { FundedAccountSnapshot } from '@shared/funded/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format ms to countdown string: "03:42:17" or "00:09" if < 1 hr */
function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00'
  const s  = Math.floor(ms / 1000)
  const h  = Math.floor(s / 3600)
  const m  = Math.floor((s % 3600) / 60)
  const ss = s % 60
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

/** Phase → display label */
const PHASE_LABEL: Record<string, string> = {
  combine:   'COMBINE',
  funded:    'FUNDED',
  activated: 'ACTIVATED',
}

/** Phase → CSS class suffix for color coding */
const PHASE_CLS: Record<string, string> = {
  combine:   'phase-combine',
  funded:    'phase-funded',
  activated: 'phase-activated',
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ ledger }: { ledger: FundedAccountSnapshot['ledger'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || ledger.length < 2) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth  * dpr
    const h = canvas.clientHeight * dpr
    canvas.width  = w
    canvas.height = h
    ctx.scale(dpr, dpr)

    const values = ledger.map(e => e.equity)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const range = max - min || 1

    const cw = canvas.clientWidth
    const ch = canvas.clientHeight
    const step = cw / (values.length - 1)

    ctx.clearRect(0, 0, cw, ch)

    // Gradient fill
    const grad = ctx.createLinearGradient(0, 0, 0, ch)
    grad.addColorStop(0, 'rgba(201,160,74,0.3)')
    grad.addColorStop(1, 'rgba(201,160,74,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(0, ch)
    values.forEach((v, i) => {
      const x = i * step
      const y = ch - ((v - min) / range) * (ch - 4) - 2
      if (i === 0) ctx.lineTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.lineTo((values.length - 1) * step, ch)
    ctx.closePath()
    ctx.fill()

    // Line
    ctx.strokeStyle = 'var(--bb-gold, #c9a04a)'
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.beginPath()
    values.forEach((v, i) => {
      const x = i * step
      const y = ch - ((v - min) / range) * (ch - 4) - 2
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
  }, [ledger])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '36px', display: 'block' }}
      aria-label="EOD equity sparkline"
    />
  )
}

// ── MLL Gauge ────────────────────────────────────────────────────────────────

function MllGauge({ snap }: { snap: FundedAccountSnapshot }) {
  const { profile, mllBuffer, currentMll, mllLocked } = snap
  if (!profile) return null

  const totalRange = profile.trailingMaxDrawdown
  // bufferPct is how far we are from the MLL as a fraction of total drawdown room
  const bufferPct = Math.max(0, Math.min(1, mllBuffer / totalRange))
  const usedPct   = 1 - bufferPct

  const dangerZone = usedPct > 0.8  // last 20% of room = amber
  const criticalZone = usedPct > 0.95  // last 5% = red

  const barColor = criticalZone
    ? 'var(--bb-ambient, #e94b3c)'
    : dangerZone
      ? 'var(--bb-warn, #f0a500)'
      : 'var(--bb-pos, #26a17b)'

  return (
    <div className="fa-mll-gauge">
      <div className="fa-gauge-header">
        <span className="fa-gauge-label">
          MLL {mllLocked ? '🔒 STATIC' : 'TRAILING'}
        </span>
        <span className="fa-gauge-values">
          <span style={{ color: criticalZone ? 'var(--bb-ambient)' : dangerZone ? 'var(--bb-warn)' : 'var(--bb-pos)' }}>
            {fmt.money(mllBuffer, 0)} buffer
          </span>
          <span className="fa-gauge-sep">·</span>
          <span className="fa-text-dim">MLL {fmt.money(currentMll, 0)}</span>
        </span>
      </div>
      <div className="fa-gauge-track">
        <div
          className="fa-gauge-fill"
          style={{ width: `${usedPct * 100}%`, background: barColor }}
          title={`${(usedPct * 100).toFixed(1)}% of MaxDD consumed`}
        />
        {/* Danger zone marker at 80% */}
        <div className="fa-gauge-marker" style={{ left: '80%' }} />
      </div>
      <div className="fa-gauge-footer">
        <span className="fa-text-dim">${fmt.money(currentMll - profile.trailingMaxDrawdown, 0)} origin</span>
        <span className="fa-text-dim">{fmt.money(currentMll, 0)} MLL</span>
      </div>
    </div>
  )
}

// ── Daily P&L Row ─────────────────────────────────────────────────────────────

function DailyPnlRow({ snap, accountDailyPnl }: { snap: FundedAccountSnapshot; accountDailyPnl: number }) {
  const { profile } = snap
  if (!profile) return null

  const limit = profile.dailyLossLimit
  const used  = Math.abs(Math.min(0, accountDailyPnl))  // only count losses
  const pct   = limit > 0 ? used / limit : 0
  const ok    = accountDailyPnl >= 0 || pct < 0.5
  const warn  = !ok && pct < 0.85
  const crit  = pct >= 0.85

  const statusColor = crit
    ? 'var(--bb-ambient)'
    : warn
      ? 'var(--bb-warn)'
      : accountDailyPnl >= 0
        ? 'var(--bb-pos)'
        : 'var(--text-4, #aaa)'

  return (
    <div className="fa-row">
      <span className="fa-row-key">DAILY P&L</span>
      <span className="fa-row-value" style={{ color: statusColor }}>
        {fmt.money(accountDailyPnl, 0)}
      </span>
      <span className="fa-row-dim">/ limit {fmt.money(-limit, 0)}</span>
      {crit && <span className="fa-badge fa-badge-danger">NEAR LIMIT</span>}
    </div>
  )
}

// ── EOD Countdown ─────────────────────────────────────────────────────────────

function EodCountdown({ msToFlatBy }: { msToFlatBy: number }) {
  // Local tick — recomputes every second so the countdown runs without
  // waiting for an engine push. We offset from the snapshot's msToFlatBy
  // value using Date.now() - snapTime. The engine pushes every tick anyway
  // (~20 Hz) so drift is minimal; the local tick is just UX smoothing.
  const [ms, setMs] = useState(msToFlatBy)
  const startRef = useRef<number>(Date.now())
  const baseRef  = useRef<number>(msToFlatBy)

  useEffect(() => {
    startRef.current = Date.now()
    baseRef.current  = msToFlatBy
    setMs(msToFlatBy)
  }, [msToFlatBy])

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      setMs(Math.max(0, baseRef.current - elapsed))
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const urgent   = ms > 0 && ms < 30 * 60 * 1000   // < 30 min
  const veryUrgent = ms > 0 && ms < 5 * 60 * 1000  // < 5 min

  if (ms <= 0) return (
    <div className="fa-row">
      <span className="fa-row-key">EOD FLAT</span>
      <span className="fa-row-value" style={{ color: 'var(--bb-ambient)' }}>ACTIVE · FLATTENING</span>
    </div>
  )

  return (
    <div className="fa-row">
      <span className="fa-row-key">EOD FLAT</span>
      <span
        className="fa-row-value fa-mono"
        style={{
          color: veryUrgent
            ? 'var(--bb-ambient)'
            : urgent
              ? 'var(--bb-warn)'
              : 'var(--text-2, #fff)',
        }}
      >
        {fmtCountdown(ms)}
      </span>
      {urgent && !veryUrgent && <span className="fa-badge fa-badge-warn">SOON</span>}
      {veryUrgent && <span className="fa-badge fa-badge-danger">URGENT</span>}
    </div>
  )
}

// ── Panel ─────────────────────────────────────────────────────────────────────

interface Props {
  /** Render as a compact single-row summary (for BottomBar embedding). */
  mini?: boolean
}

export function FundedAccountPanel({ mini = false }: Props) {
  const snap   = useFundedAccountStore(s => s.snapshot)
  const pnl    = useAccountStore(s => s.account.dailyPnl)
  const [collapsed, setCollapsed] = useState(false)

  const toggle = useCallback(() => setCollapsed(c => !c), [])

  // No profile active → show an invitation to configure one.
  if (!snap || !snap.active || !snap.profile) {
    if (mini) return null
    return (
      <div className="fa-panel fa-panel-inactive">
        <span className="fa-inactive-label">NO PROGRAMME ACTIVE</span>
        <span className="fa-inactive-hint">Configure in Settings → Funded Programme</span>
      </div>
    )
  }

  const { profile, msToFlatBy, ledger, highestEodBalance } = snap
  const phase = profile.phase

  // ── MINI mode: single-line for BottomBar ──────────────────────────────────
  if (mini) {
    const bufferPct = Math.max(0, Math.min(1, snap.mllBuffer / profile.trailingMaxDrawdown))
    const usedPct   = 1 - bufferPct
    const crit = usedPct > 0.95
    const warn = usedPct > 0.8
    const mllColor = crit
      ? 'var(--bb-ambient)'
      : warn
        ? 'var(--bb-warn)'
        : 'var(--bb-pos)'
    const pnlPos = pnl >= 0

    return (
      <span className="fa-mini">
        <span className={`fa-phase-pill fa-phase-pill--${PHASE_CLS[phase] ?? 'phase-combine'}`}>
          {PHASE_LABEL[phase] ?? phase.toUpperCase()}
        </span>
        <span className="fa-mini-sep">·</span>
        <span style={{ color: mllColor }}>
          MLL {fmt.money(snap.mllBuffer, 0)}
        </span>
        <span className="fa-mini-sep">·</span>
        <span style={{ color: pnlPos ? 'var(--bb-pos)' : 'var(--bb-ambient)' }}>
          {pnlPos ? '+' : ''}{fmt.money(pnl, 0)}
        </span>
      </span>
    )
  }

  // ── FULL mode ─────────────────────────────────────────────────────────────
  return (
    <div className={`fa-panel${collapsed ? ' fa-panel--collapsed' : ''}`}>
      {/* Header */}
      <div className="fa-header" onClick={toggle} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && toggle()}>
        <span className={`fa-phase-pill fa-phase-pill--${PHASE_CLS[phase] ?? 'phase-combine'}`}>
          {PHASE_LABEL[phase] ?? phase.toUpperCase()}
        </span>
        <span className="fa-header-name">{profile.name}</span>
        <span className="fa-header-firm">{profile.firm.toUpperCase()}</span>
        <span className="fa-collapse-btn" aria-label={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? '▸' : '▾'}
        </span>
      </div>

      {!collapsed && (
        <div className="fa-body">
          {/* MLL Gauge */}
          <MllGauge snap={snap} />

          {/* Key rows */}
          <div className="fa-rows">
            <DailyPnlRow snap={snap} accountDailyPnl={pnl} />

            <div className="fa-row">
              <span className="fa-row-key">PEAK EOD</span>
              <span className="fa-row-value">{fmt.usd(highestEodBalance, 0)}</span>
              <span className="fa-row-dim">starting {fmt.usd(profile.initialBalance, 0)}</span>
            </div>

            <div className="fa-row">
              <span className="fa-row-key">PROFIT TARGET</span>
              <span className="fa-row-value">{fmt.usd(profile.profitTarget, 0)}</span>
              <span className="fa-row-dim">{profile.minTradingDays} min days</span>
            </div>

            <EodCountdown msToFlatBy={msToFlatBy} />
          </div>

          {/* EOD equity sparkline */}
          {ledger.length >= 2 && (
            <div className="fa-sparkline-section">
              <span className="fa-section-label">EOD EQUITY HISTORY</span>
              <Sparkline ledger={ledger.slice(-10)} />
            </div>
          )}

          {/* Emergency flatten button */}
          <div className="fa-actions">
            <button
              className="fa-flat-btn"
              onClick={() => {
                void window.satex?.triggerFundedFlat?.('operator-manual')
              }}
              title="Force-close all positions and cancel pending orders immediately"
            >
              ⚡ FLATTEN NOW
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
