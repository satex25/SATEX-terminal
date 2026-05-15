/**
 * SATEX — Order Ticket Panel
 * Full order form (BUY/SELL · MKT/LMT/STP · qty · SL/TP) with risk-gate feedback.
 * Submits via window.satex.submitOrder.
 */
import { useState } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import {
  findUniverseEntry,
  DAILY_LOSS_LIMIT_PCT,
  MAX_OPEN_POSITIONS,
  MAX_POSITION_CONCENTRATION,
} from '@shared/constants'
import { fmt } from '../lib/format'
import { JOURNAL_TAGS, type JournalTag, type OrderRequest, type OrderType } from '@shared/types'

export function OrderTicketPanel() {
  const symbol  = useMarketStore(s => s.symbol)
  const quote   = useMarketStore(s => s.quotes.get(symbol))
  const account = useAccountStore(s => s.account)
  const entry   = findUniverseEntry(symbol)
  const dp      = entry?.dp ?? 2

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [type, setType] = useState<OrderType>('market')
  const [qty,  setQty]  = useState('1')
  const [lp,   setLp]   = useState('')
  const [sl,   setSl]   = useState('')
  const [tp,   setTp]   = useState('')
  const [msg,  setMsg]  = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  // Journal metadata (modern-terminal-survey §6). Tags + conviction live on
  // the order request; downstream pickup happens in the vault writer (follow-up).
  const [tags, setTags] = useState<JournalTag[]>([])
  const [conviction, setConviction] = useState(5)
  const toggleTag = (t: JournalTag) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const last = quote?.last ?? 0
  const notional = (parseFloat(qty) || 0) * last

  async function submit() {
    if (!window.satex) return
    setBusy(true); setMsg(null)
    const req: OrderRequest = {
      symbol, side, type, quantity: parseFloat(qty) || 1,
      ...(type === 'limit' && lp ? { limitPrice: parseFloat(lp) } : {}),
      ...(sl ? { stopLoss: parseFloat(sl) } : {}),
      ...(tp ? { takeProfit: parseFloat(tp) } : {}),
      ...(tags.length > 0 ? { tags } : {}),
      ...(conviction !== 5 ? { conviction } : {}),
      source: 'ticket',
    }
    try {
      const res = await window.satex.submitOrder(req)
      setMsg({ ok: res.ok, text: res.ok ? `Order submitted — ${res.orderId}` : res.reason ?? 'Rejected' })
      if (res.ok) {
        // Reset journal metadata after successful submit so it doesn't bleed
        // into the next order. Keep core form state so user can fire follow-ups.
        setTags([])
        setConviction(5)
      }
    } catch (e) {
      setMsg({ ok: false, text: String(e) })
    }
    setBusy(false)
  }

  return (
    <div className="order-ticket">
      <div className="ot-side">
        <button type="button" className={`buy ${side === 'buy' ? 'on' : ''}`}   onClick={() => setSide('buy')}>BUY</button>
        <button type="button" className={`sell ${side === 'sell' ? 'on' : ''}`} onClick={() => setSide('sell')}>SELL</button>
      </div>

      <div className="seg">
        {(['market', 'limit', 'stop'] as const).map(t => (
          <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(t)}>
            {t === 'market' ? 'MKT' : t === 'limit' ? 'LMT' : 'STP'}
          </button>
        ))}
      </div>

      <div className="ot-row">
        <span className="ot-lbl">Qty</span>
        <div className="ot-quick" style={{ alignItems: 'center', gap: 6 }}>
          <input className="ot-input" type="number" value={qty} onChange={e => setQty(e.target.value)} />
          {[1, 5, 10, 25, 100].map(n => (
            <button key={n} type="button" onClick={() => setQty(String(n))}>{n}</button>
          ))}
        </div>
      </div>

      {type === 'limit' && (
        <div className="ot-row">
          <span className="ot-lbl">Limit</span>
          <input className="ot-input" type="number" value={lp} onChange={e => setLp(e.target.value)} placeholder={fmt.px(last, dp)} />
        </div>
      )}
      <div className="ot-row">
        <span className="ot-lbl">SL</span>
        <input className="ot-input" type="number" value={sl} onChange={e => setSl(e.target.value)} placeholder="optional" />
      </div>
      <div className="ot-row">
        <span className="ot-lbl">TP</span>
        <input className="ot-input" type="number" value={tp} onChange={e => setTp(e.target.value)} placeholder="optional" />
      </div>

      {/* Journal: tag pills + conviction slider. Optional metadata that flows
          with the order request for later vault-side journaling aggregates. */}
      <div className="ot-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <span className="ot-lbl" style={{ fontSize: 9, color: 'var(--ink-3)' }}>JOURNAL TAGS</span>
        <div className="ot-tags">
          {JOURNAL_TAGS.map(t => (
            <button
              key={t}
              type="button"
              className={`ot-tag${tags.includes(t) ? ' on' : ''}`}
              onClick={() => toggleTag(t)}
            >{t}</button>
          ))}
        </div>
      </div>
      <div className="ot-row">
        <span className="ot-lbl">CONV {conviction}/10</span>
        <input
          className="ot-conv"
          type="range" min={1} max={10} step={1}
          value={conviction}
          onChange={e => setConviction(parseInt(e.target.value, 10))}
        />
      </div>

      <div className="ot-summary">
        <div className="ot-sum-row"><span className="k">LAST</span><span className="v">{fmt.px(last, dp)}</span></div>
        <div className="ot-sum-row"><span className="k">NOTIONAL</span><span className="v">{fmt.usd(notional, 0)}</span></div>
        <div className="ot-sum-row"><span className="k">BP</span><span className="v">{fmt.usd(account.buyingPower, 0)}</span></div>
        <div className="ot-sum-row"><span className="k">CASH</span><span className="v">{fmt.usd(account.cash, 0)}</span></div>
      </div>

      {account.killSwitchArmed && (
        <div className="tag bear" style={{ textAlign: 'center', padding: '6px 10px', fontSize: 10 }}>
          ⚠ KILL SWITCH ARMED — orders blocked
        </div>
      )}

      <button
        type="button"
        className={`ot-cta ${side}`}
        disabled={busy || account.killSwitchArmed}
        onClick={submit}
      >
        {busy ? 'SUBMITTING…' : `${side.toUpperCase()} ${qty} ${symbol}`}
      </button>

      {msg && (
        <div className={`tag ${msg.ok ? 'bull' : 'bear'}`} style={{ padding: '6px 10px', textAlign: 'center', fontSize: 10 }}>
          {msg.text}
        </div>
      )}

      <div style={{ fontSize: 9, color: 'var(--ink-3)', textAlign: 'center', lineHeight: 1.6 }}>
        Risk gates · Daily loss {(DAILY_LOSS_LIMIT_PCT * 100).toFixed(1)}% · Max {MAX_OPEN_POSITIONS} positions · {(MAX_POSITION_CONCENTRATION * 100).toFixed(0)}% concentration
      </div>
    </div>
  )
}
