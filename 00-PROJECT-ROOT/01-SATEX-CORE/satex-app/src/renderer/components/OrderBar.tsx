/**
 * SATEX — Bottom order bar (56px row).
 * One-click order entry. Lives outside the canvas so it's always reachable.
 * All order submissions route through window.satex.submitOrder.
 */
import { useState, useMemo } from 'react'
import { useMarketStore } from '../stores/marketStore'
import { useAccountStore } from '../stores/accountStore'
import { findUniverseEntry, STARTING_EQUITY } from '@shared/constants'
import { fmt } from '../lib/format'
import type { OrderType } from '@shared/types'

export function OrderBar() {
  const symbol  = useMarketStore(s => s.symbol)
  const quote   = useMarketStore(s => s.quotes.get(symbol))
  const account = useAccountStore(s => s.account)
  const armed   = account.killSwitchArmed

  const entry = findUniverseEntry(symbol)
  const dp    = entry?.dp ?? 2
  const last  = quote?.last ?? 0

  const [type, setType] = useState<OrderType>('market')
  const [qty,  setQty]  = useState<number>(1)
  const [sl,   setSl]   = useState<string>('')
  const [tp,   setTp]   = useState<string>('')
  const [busy, setBusy] = useState(false)

  const notional = (qty || 0) * last
  const riskPct = useMemo(() => {
    if (!notional) return 0
    return Math.min(100, (notional / Math.max(1, account.buyingPower)) * 100)
  }, [notional, account.buyingPower])

  async function place(side: 'buy' | 'sell') {
    if (!window.satex || busy || armed) return
    setBusy(true)
    try {
      await window.satex.submitOrder({
        symbol, side, type, quantity: qty || 1,
        ...(sl ? { stopLoss: parseFloat(sl) } : {}),
        ...(tp ? { takeProfit: parseFloat(tp) } : {}),
        source: 'orderbar',
      })
    } finally {
      setBusy(false)
    }
  }

  async function toggleKill() {
    if (!window.satex) return
    await window.satex.killSwitch(!armed)
  }

  return (
    <div className="orderbar">
      <div className="group">
        <span className="lbl">Order</span>
        <div className="seg">
          {(['market', 'limit', 'stop'] as const).map(t => (
            <button
              key={t}
              type="button"
              className={type === t ? 'on' : ''}
              onClick={() => setType(t)}
            >
              {t === 'market' ? 'MKT' : t === 'limit' ? 'LMT' : 'STP'}
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <input className="field" value={symbol} readOnly style={{ width: 64, fontWeight: 600 }} aria-label="Symbol" />
        <input
          className="field"
          type="number"
          value={qty}
          onChange={e => setQty(Math.max(0, +e.target.value || 0))}
          style={{ width: 64 }}
          placeholder="QTY"
          aria-label="Quantity"
        />
      </div>

      <div className="group">
        <span className="lbl">@</span>
        <input className="field" value={fmt.px(last, dp)} readOnly style={{ width: 96 }} aria-label="Last price" />
        <span className="lbl">SL</span>
        <input className="field" value={sl} onChange={e => setSl(e.target.value)} placeholder="—" style={{ width: 80 }} aria-label="Stop loss" />
        <span className="lbl">TP</span>
        <input className="field" value={tp} onChange={e => setTp(e.target.value)} placeholder="—" style={{ width: 80 }} aria-label="Take profit" />
      </div>

      <div className="group" style={{ justifySelf: 'center' }}>
        <span className="lbl">Risk {riskPct.toFixed(1)}%</span>
        <div className="risk-meter" title={`Notional ${fmt.usd(notional, 0)} / BP ${fmt.usd(account.buyingPower, 0)}`}>
          <div className="risk-meter-fill" style={{ width: `${riskPct}%` }} />
          <div className="risk-meter-marker" style={{ left: `${riskPct}%` }} />
        </div>
      </div>

      <button type="button" className="btn-buy"  disabled={busy || armed} onClick={() => place('buy')}>
        BUY · LONG
      </button>
      <button type="button" className="btn-sell" disabled={busy || armed} onClick={() => place('sell')}>
        SELL · SHORT
      </button>
      <button
        type="button"
        className="btn-kill"
        onClick={toggleKill}
        title={armed ? `Disarm kill switch (PnL ${fmt.pct((account.dailyPnl / STARTING_EQUITY) * 100)})` : 'Arm kill switch'}
        style={armed ? { background: 'var(--bear)', color: 'var(--bg-0)', borderColor: 'var(--bear)' } : undefined}
      >
        ⏻ {armed ? 'KILL ON' : 'KILL'}
      </button>
    </div>
  )
}
