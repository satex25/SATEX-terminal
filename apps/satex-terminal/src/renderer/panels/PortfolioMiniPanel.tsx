/**
 * SATEX — Portfolio Mini Panel (Phase 10 · Black Box)
 *
 * Replaces PortfolioPanel. 4 KV pairs (EQUITY/CASH/DAILY P&L/BP) plus a
 * 100px equity sparkline. Sparkline is derived from the most-recent PnL
 * snapshots fetched once on mount + refreshed every 30s.
 */
import { useEffect, useMemo, useState } from 'react'
import { useAccountStore } from '../stores/accountStore'
import { PanelHead } from '../components/PanelHead'
import { fmt } from '../lib/format'
import { DEFAULT_EQUITY } from '@shared/constants'
import { seriesExtent } from '../lib/extent'

function MiniKV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="bb-mini-kv">
      <div className="bb-mini-k">{k}</div>
      <div className="bb-mini-v">{v}</div>
    </div>
  )
}

export function PortfolioMiniPanel() {
  const account = useAccountStore(s => s.account)
  const [snapshots, setSnapshots] = useState<number[]>([])

  // Pull recent PnL snapshots for the equity curve.
  useEffect(() => {
    let cancelled = false
    const pull = async () => {
      try {
        const sessions = await window.satex?.getSessions()
        if (!sessions || sessions.length === 0) return
        const sid = sessions[0]!.id
        const snaps = await window.satex?.getPnlSnapshots(sid)
        if (cancelled || !snaps) return
        const equityPts = snaps.map(s => s.equity)
        // If empty, seed with the current equity so the chart isn't blank.
        if (equityPts.length === 0) equityPts.push(account.equity)
        setSnapshots(equityPts)
      } catch { /* ignore */ }
    }
    void pull()
    const id = setInterval(pull, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [account.equity])

  const pnlPos = account.dailyPnl >= 0
  const stroke = pnlPos ? 'var(--bb-pos)' : 'var(--bb-neg)'

  // Single-pass min/max — never Math.min(...snapshots). PnL snapshots accumulate
  // at one entry/minute with no LIMIT (listPnlSnapshots), so an always-on session
  // grows the array past the spread arg cap and the spread would throw RangeError
  // (P-041 — same invariant as vol-heatmap / QuadPaneChart, P-027).
  const { min: eqMin, max: eqMax } = useMemo(() => seriesExtent(snapshots), [snapshots])

  const path = useMemo(() => {
    if (snapshots.length < 2) return ''
    const W = 232, H = 100, pad = 6
    const span = (eqMax - eqMin) || 1
    return snapshots.map((v, i) => {
      const x = (i / (snapshots.length - 1)) * W
      const y = H - pad - ((v - eqMin) / span) * (H - 2 * pad)
      return `${x.toFixed(2)},${y.toFixed(2)}`
    }).join(' ')
  }, [snapshots, eqMin, eqMax])

  // Baseline (starting equity) y-coordinate — computed once from the same extent.
  const baseY = snapshots.length >= 2
    ? 50 - ((DEFAULT_EQUITY - eqMin) / Math.max(1, eqMax - eqMin)) * 88 + 6
    : 0

  return (
    <div className="bb-portfolio-mini">
      <PanelHead title="PORTFOLIO" right={<span>{account.mode.toUpperCase()}</span>} />
      <div className="bb-mini-grid">
        <MiniKV k="EQUITY"    v={fmt.usd(account.equity, 0)} />
        <MiniKV k="CASH"      v={fmt.usd(account.cash, 0)} />
        <MiniKV k="DAILY P&L" v={<span className={pnlPos ? 'bb-pos' : 'bb-neg'}>{fmt.money(account.dailyPnl, 0)}</span>} />
        <MiniKV k="BP"        v={fmt.usd(account.buyingPower, 0)} />
      </div>
      <div className="bb-mini-curve">
        {path && (
          <svg width="100%" height="100%" viewBox="0 0 232 100" preserveAspectRatio="none">
            <line x1="0" x2="232" y1="50" y2="50" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 3" />
            <line x1="0" x2="232"
              y1={baseY}
              y2={baseY}
              stroke="var(--bb-txt-mute)" strokeDasharray="2 2" strokeOpacity="0.3" />
            <polyline points={path} fill="none" stroke={stroke} strokeWidth="1.4" />
          </svg>
        )}
      </div>
    </div>
  )
}
