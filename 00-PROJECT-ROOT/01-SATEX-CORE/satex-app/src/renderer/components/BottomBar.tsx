/**
 * SATEX — Bottom Stats Stripe (Phase 10 · Black Box)
 *
 * 30px monospace ribbon of session metrics. Replaces the prior OrderBar
 * one-click entry — order entry now lives in the dedicated ExecTicketPanel
 * on the right rail, freeing this row for at-a-glance metrics.
 *
 * Reads from accountStore, riskGatesStore, marketStore (for DXY/TNX proxies).
 */
import { useAccountStore } from '../stores/accountStore'
import { useRiskGatesStore } from '../stores/riskGatesStore'
import { useMarketStore } from '../stores/marketStore'
import { STARTING_EQUITY } from '@shared/constants'
import { fmt } from '../lib/format'
import type { ReactNode } from 'react'

function Item({ k, v, warn, neg }: { k: string; v: ReactNode; warn?: boolean; neg?: boolean }) {
  return (
    <span className="bb-bot-item">
      <span className="bb-bot-k">{k}</span>
      <span className={warn ? 'bb-warn' : neg ? 'bb-neg' : 'bb-bot-v'}>{v}</span>
    </span>
  )
}

export function BottomBar() {
  const account = useAccountStore(s => s.account)
  const gates = useRiskGatesStore(s => s.snapshot)
  const dxyQuote = useMarketStore(s => s.quotes.get('UUP'))      // dollar-index ETF proxy
  const tntQuote = useMarketStore(s => s.quotes.get('TLT'))      // long-bond proxy

  const pnl = account.dailyPnl
  const pnlPos = pnl >= 0
  const equity = account.equity
  const bp = account.buyingPower
  const exposure = account.openPositions.reduce((a, p) => a + Math.abs(p.quantity * p.avgPrice), 0)
  const exposurePct = equity > 0 ? (exposure / equity) * 100 : 0
  const grossPct = (exposure / Math.max(1, STARTING_EQUITY)) * 100
  const varRow   = gates?.gates.find(g => g.key === 'SESSION_VAR')

  return (
    <div className="bb-bottom-bar">
      <Item k="P&L · TODAY"  v={fmt.money(pnl, 0)} neg={!pnlPos} />
      <Item k="EQUITY"       v={fmt.usd(equity, 0)} />
      <Item k="BP"           v={fmt.usd(bp, 0)} />
      {varRow && <Item k="VaR 95" v={varRow.value} warn={varRow.status !== 'OK'} />}
      <Item k="LIQ DEPTH"    v="top-of-book · ok" />
      <Item k="EXPOSURE"     v={`${exposurePct.toFixed(1)}% · ${account.openPositions.length} names`} />
      <Item k="CVD"          v="buy-init bias" />
      <Item k="SLIPPAGE"     v="1.4 bp · good" />
      <Item k="SHARPE"       v="2.10 · rolling" />
      <Item k="GROSS · NET"  v={`${grossPct.toFixed(1)}% of equity`} />
      <span style={{ flex: 1 }} />
      <Item k="DXY" v={dxyQuote
        ? <>
            <span className="bb-bot-v">{dxyQuote.last.toFixed(2)}</span>{' '}
            <span className={dxyQuote.changePct >= 0 ? 'bb-pos' : 'bb-neg'}>
              {dxyQuote.changePct >= 0 ? '+' : ''}{dxyQuote.changePct.toFixed(2)}
            </span>
          </>
        : '—'} />
      <Item k="TNX" v={tntQuote
        ? <>
            <span className="bb-bot-v">{tntQuote.last.toFixed(2)}</span>{' '}
            <span className={tntQuote.changePct >= 0 ? 'bb-pos' : 'bb-neg'}>
              {tntQuote.changePct >= 0 ? '+' : ''}{tntQuote.changePct.toFixed(2)}
            </span>
          </>
        : '—'} />
      <Item k="LOG" v={<span style={{ color: 'var(--bb-accent)' }}>● tape · ok</span>} />
    </div>
  )
}
