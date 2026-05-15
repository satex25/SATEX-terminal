/**
 * SATEX — Execution Order Ticket Panel (Phase 10 · Black Box)
 *
 * Replaces OrderTicketPanel. BUY/SELL · MKT/LMT/STP, QTY input + chips,
 * PX (auto-mid), ALGO selector, then a preview block:
 *   NOTIONAL / BP USED / EST SLIP / RISK GATE summary
 * with the big buy/sell submit button at the bottom.
 *
 * Real submission goes through window.satex.submitOrder (verbatim contract).
 * Risk Gate preview is computed live from the riskGatesStore — when we add a
 * "would-be" gates path, this swaps to gatesForPreview.
 */
import { useMemo, useState } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import { useReplayStore } from '../stores/replayStore'
import { useRiskGatesStore } from '../stores/riskGatesStore'
import { PanelHead } from '../components/PanelHead'
import { findUniverseEntry } from '@shared/constants'
import { fmt } from '../lib/format'
import type { OrderType } from '@shared/types'

const ALGOS = [
  'Almgren-Chriss · η 0.4',
  'VWAP · slice 20%',
  'POV · 8%',
  'IOC · cross-spread',
] as const

const QTY_CHIPS = [1, 100, 500, 1000] as const

export function ExecTicketPanel() {
  const symbol  = useMarketStore(s => s.symbol)
  const quote   = useMarketStore(s => s.quotes.get(symbol))
  const account = useAccountStore(s => s.account)
  const gates   = useRiskGatesStore(s => s.snapshot)
  const replayActive = useReplayStore(s => s.active)

  const entry = findUniverseEntry(symbol)
  const dp = entry?.dp ?? 2
  const lastPx = quote?.last ?? 0

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [type, setType] = useState<OrderType>('market')
  const [qty,  setQty]  = useState<number>(100)
  const [algoIdx, setAlgoIdx] = useState<number>(0)
  const [busy, setBusy] = useState(false)

  const notional = useMemo(() => qty * lastPx, [qty, lastPx])
  const bpUsed = account.buyingPower
  const riskPreviewStatus = gates?.gates.find(g => g.key === 'CONCENTRATION')?.status ?? 'OK'

  // ── Pre-trade slippage + fee preview ────────────────────────────────────
  // Spread in bps gives us a floor — a market order pays at least half-spread.
  // The "consumption" multiplier is a crude proxy: if the requested qty exceeds
  // what's likely sitting at the top of book, slippage grows quadratically.
  // We use prevClose-volume as a stand-in for typical-quote-depth since the
  // free Alpaca data feed doesn't expose true L2 — refine when we wire L2.
  const preview = useMemo(() => {
    if (!quote || lastPx <= 0 || qty <= 0) {
      return { slipBps: 0, slipDollar: 0, feeDollar: 0, fillProb: 1, label: '—' }
    }
    const spread = Math.max(0, quote.ask - quote.bid)
    const spreadBps = (spread / lastPx) * 10_000
    // Crude depth proxy: use 1% of recent session volume as "instant fillable" qty
    // when no L2 is available. Replace with true top-of-book size when wired.
    const depthQty = Math.max(100, (quote.volume || 1000) * 0.01)
    const consumption = qty / depthQty
    // For market orders, expected slippage = half-spread + impact ∝ √consumption.
    // Cap the impact term so a giant qty doesn't blow the meter up to NaN.
    const impactBps = type === 'market' ? Math.min(50, 5 * Math.sqrt(consumption)) : 0
    const slipBps = spreadBps * 0.5 + impactBps
    const slipDollar = (slipBps / 10_000) * lastPx * qty
    // Alpaca paper trading: zero commissions, but we still surface SEC/TAF fees
    // for sells (≈0.27 bps notional). Approximate annual blend rate.
    const feeBps = side === 'sell' ? 0.27 : 0
    const feeDollar = (feeBps / 10_000) * lastPx * qty
    // Fill probability: market orders always fill; limit orders depend on
    // distance from inside market. We don't have a user-entered limit price
    // surface here, so just signal "near 100%" for market, "depends" otherwise.
    const fillProb = type === 'market' ? 0.99 : 0.6
    const tickSize = lastPx >= 1 ? 0.01 : 0.0001
    const ticks = Math.max(1, Math.round((slipBps / 10_000) * lastPx / tickSize))
    return {
      slipBps,
      slipDollar,
      feeDollar,
      fillProb,
      label: type === 'market'
        ? `${slipBps.toFixed(1)} bp · ~${ticks} tick${ticks === 1 ? '' : 's'}`
        : `≈${spreadBps.toFixed(1)} bp spread`,
    }
  }, [quote, lastPx, qty, side, type])

  async function place() {
    if (!window.satex?.submitOrder || busy || account.killSwitchArmed || replayActive) return
    setBusy(true)
    try {
      await window.satex.submitOrder({
        symbol,
        side,
        type,
        quantity: qty || 1,
        source: 'exec-ticket',
      })
    } finally {
      setBusy(false)
    }
  }

  const submitDisabled = busy || account.killSwitchArmed || replayActive || qty <= 0
  const submitColor = side === 'buy' ? 'var(--bb-pos)' : 'var(--bb-neg)'
  const submitLabel = `${type === 'market' ? 'MKT' : type === 'limit' ? 'LMT' : 'STP'} ${side.toUpperCase()} ${qty} ${symbol}`

  return (
    <div className="bb-exec-ticket">
      <PanelHead title="EXEC · ORDER TICKET" right={<span>{symbol} · {fmt.px(lastPx, dp)} · NBBO</span>} />

      {replayActive && (
        <div className="bb-exec-disabled-banner">⏵ Trading disabled during replay</div>
      )}

      <div className="bb-exec-body">
        {/* Side + type row */}
        <div className="bb-exec-tabs">
          <button type="button" className={side === 'buy'  ? 'bb-exec-tab bb-buy on'  : 'bb-exec-tab'} onClick={() => setSide('buy')}>BUY</button>
          <button type="button" className={side === 'sell' ? 'bb-exec-tab bb-sell on' : 'bb-exec-tab'} onClick={() => setSide('sell')}>SELL</button>
          <button type="button" className={type === 'market' ? 'bb-exec-tab on small' : 'bb-exec-tab small'} onClick={() => setType('market')}>MKT</button>
          <button type="button" className={type === 'limit'  ? 'bb-exec-tab on small' : 'bb-exec-tab small'} onClick={() => setType('limit')}>LMT</button>
          <button type="button" className={type === 'stop'   ? 'bb-exec-tab on small' : 'bb-exec-tab small'} onClick={() => setType('stop')}>STP</button>
        </div>

        {/* QTY */}
        <div className="bb-exec-row">
          <span className="bb-exec-label">QTY</span>
          <input
            className="bb-exec-input"
            type="number"
            value={qty}
            min={1}
            onChange={(e) => setQty(Math.max(0, +e.target.value || 0))}
          />
          <div className="bb-exec-chips">
            {QTY_CHIPS.map(c => (
              <button
                key={c}
                type="button"
                className={qty === c ? 'on' : ''}
                onClick={() => setQty(c)}
              >{c.toLocaleString()}</button>
            ))}
          </div>
        </div>

        {/* PX */}
        <div className="bb-exec-row">
          <span className="bb-exec-label">PX</span>
          <input className="bb-exec-input" value={fmt.px(lastPx, dp)} readOnly />
          <span className="bb-exec-mute">mid · 1-click</span>
        </div>

        {/* ALGO */}
        <div className="bb-exec-row">
          <span className="bb-exec-label">ALGO</span>
          <select
            className="bb-exec-input"
            value={algoIdx}
            onChange={(e) => setAlgoIdx(+e.target.value)}
          >
            {ALGOS.map((a, i) => <option key={a} value={i}>{a}</option>)}
          </select>
        </div>

        {/* Preview */}
        <div className="bb-exec-preview">
          <PrevRow k="NOTIONAL"  v={fmt.usd(notional, 0)} />
          <PrevRow k="BP USED"   v={fmt.usd(bpUsed, 0)} />
          <PrevRow k="EST SLIP"  v={
            <span
              title={`Estimated slippage: ${fmt.usd(preview.slipDollar, 2)} on ${qty.toLocaleString()} shares\nIncludes half-spread + √(qty/depth) impact estimate`}
              className={
                preview.slipBps > 25 ? 'bb-neg'
                : preview.slipBps > 10 ? 'bb-warn'
                : ''
              }
            >
              {preview.label}
              {preview.slipDollar > 0 && type === 'market' && (
                <span style={{ color: 'var(--bb-txt-mute)', marginLeft: 6 }}>
                  · {fmt.usd(preview.slipDollar, 2)}
                </span>
              )}
            </span>
          } />
          {preview.feeDollar > 0 && (
            <PrevRow k="FEES (est)" v={fmt.usd(preview.feeDollar, 2)} />
          )}
          <PrevRow k="FILL PROB" v={
            <span className={preview.fillProb < 0.7 ? 'bb-warn' : ''}>
              {(preview.fillProb * 100).toFixed(0)}%
              {type !== 'market' && (
                <span style={{ color: 'var(--bb-txt-mute)', marginLeft: 4 }}>· depends on px</span>
              )}
            </span>
          } />
          <PrevRow k="RISK GATE" v={
            <span className={
              riskPreviewStatus === 'OK' ? 'bb-pos'
              : riskPreviewStatus === 'WATCH' ? 'bb-warn'
              : 'bb-neg'
            }>
              ● {riskPreviewStatus === 'OK' ? 'PASS' : riskPreviewStatus}
              {gates && ` · ${gates.passingCount}/${gates.gates.length}`}
            </span>
          } />
        </div>

        <button
          type="button"
          className="bb-exec-cta"
          style={{ background: submitColor }}
          disabled={submitDisabled}
          onClick={place}
          title={
            account.killSwitchArmed ? 'Kill switch armed — disarm to trade' :
            replayActive            ? 'Trading disabled during replay' : ''
          }
        >{submitLabel}</button>
      </div>
    </div>
  )
}

function PrevRow({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="bb-exec-prev-row">
      <span className="bb-exec-prev-k">{k}</span>
      <span className="bb-exec-prev-v">{v}</span>
    </div>
  )
}
